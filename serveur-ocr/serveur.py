# serveur-ocr/serveur.py — v0.1.23/25/26 : serveur OCR personnel.
# Fait tourner, sur VOTRE ordinateur, deux moteurs locaux :
#   - RapidLaTeXOCR (MIT) : l'image d'une formule -> LaTeX (v0.1.23) ;
#   - MinerU (AGPL, v0.1.26) : une page entière -> titres, texte, formules,
#     tableaux, images (mots avec leurs positions). Installez-le avec
#     requirements.txt ; il ne se charge qu'au premier POST /page.
# Atelier PDF (sur un autre ordinateur, y compris par le réseau privé
# Tailscale) lui POSTe des images ; rien ne quitte vos machines.
#
# Usage :
#   python serveur.py            # écoute sur toutes les interfaces, port 8642
#   python serveur.py --port 9000
#   python serveur.py --banc      # mode banc d'essai : réponses fixes, SANS
#                                 # moteur (pour vérifier l'URL, Tailscale et
#                                 # le pare-feu AVANT d'installer les modèles)
#   python serveur.py --jeton MONSECRET
#                                # exige l'en-tête "Authorization: Bearer
#                                # MONSECRET" sur chaque POST (le GET
#                                # d'état reste ouvert) ; sinon variable
#                                # d'environnement JETON_OCR
#   python serveur.py --niveau standard
#                                # niveau de reconnaissance des pages
#                                # (flash|basic|standard|advanced, défaut
#                                # basic) ; voir LISEZMOI.md et comparatif.py
#   python serveur.py --diagnostic
#                                # (mode réel) journalise la structure brute
#                                # renvoyée par MinerU pour la première page
#
# Endpoints :
#   GET  n'importe quoi         # {"service": …, "banc": …} (êtes-vous là ?)
#   POST <…>/ocr  {image_url}   # formule -> {"latex": …}
#   POST <…>/page {image_url}   # page complète -> {"largeur": …, "hauteur": …,
#                                # "blocs": [titre|texte|formule|tableau|image]}
#
# Dépendances (hors mode --banc) : voir requirements.txt.
# Voir LISEZMOI.md pour l'installation complète.

import argparse
import base64
import json
import os
import re
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# L'URL attendue dans le corps de la requête : une adresse "data" PNG.
MOTIF_DATA_URL = re.compile(r"^data:image/(png|jpeg);base64,([A-Za-z0-9+/=]+)$")
SIGNATURE_PNG = b"\x89PNG\r\n\x1a\n"
SIGNATURE_JPEG = b"\xff\xd8\xff"

verrou_moteur = threading.Lock()   # UN moteur à la fois : RapidLaTeXOCR OU
moteur = None                      # MinerU (8 Go de VRAM ne tiennent pas les
mode_banc = False                  # deux en même temps) ; construit au premier
jeton_actif = ""                   # appel (télécharge les modèles la toute
niveau_actif = "basic"             # première fois)
diagnostic = False

# Page factice du banc pour /page (v0.1.26) : la chaîne complète est
# éprouvée sans MinerU : dispatch, jeton, contrat, résumé de l'app.
PAGE_BANC = {
    "largeur": 1654,
    "hauteur": 2339,
    "blocs": [
        {"type": "titre", "bbox": [132, 141, 1522, 199],
         "texte": "Titre de la page"},
        {"type": "texte", "bbox": [132, 231, 1522, 339], "lignes": [
            {"bbox": [132, 231, 1522, 267], "mots": [
                {"bbox": [132, 231, 204, 267], "texte": "Première"},
                {"bbox": [216, 231, 316, 267], "texte": "ligne"},
                {"bbox": [328, 231, 392, 267], "texte": "de"},
                {"bbox": [404, 231, 528, 267], "texte": "texte."}]},
            {"bbox": [132, 303, 1522, 339], "mots": [
                {"bbox": [132, 303, 232, 339], "texte": "Deuxième"},
                {"bbox": [244, 303, 344, 339], "texte": "ligne."}]}]},
        {"type": "formule", "bbox": [132, 419, 1037, 547],
         "latex": "\\frac{x^{2}}{a^{2}}-\\frac{y^{2}}{b^{2}}=1"},
        {"type": "tableau", "bbox": [132, 619, 1522, 875],
         "html": "<table><tr><td>a</td><td>b</td></tr>"
                 "<tr><td>1</td><td>2</td></tr></table>"},
        {"type": "image", "bbox": [132, 947, 1522, 1303]},
    ],
}


def autorise(entete_authorization, jeton):
    """True si la requête passe : jamais verrouillé, ou Bearer exact."""
    if not jeton:
        return True
    return entete_authorization == "Bearer " + jeton


def charger_moteur():
    """Importe et construit le moteur de formules (ou le banc d'essai)."""
    global moteur
    if moteur is not None:
        return moteur
    if mode_banc:
        moteur = lambda octets: ({"latex": "\\frac{x^{2}}{a^{2}}-\\frac{y^{2}}{b^{2}}=1", "score": 1.0}, 0.0)
        return moteur
    try:
        from rapid_latex_ocr import LaTeXOCR
    except ImportError:
        raise RuntimeError(
            "Le moteur n'est pas installé. Dans ce dossier : "
            "pip install -r requirements.txt"
        )
    moteur = LaTeXOCR()  # première fois : téléchargement des modèles
    return moteur


def lire_taille_image(octets):
    """(largeur, hauteur) lues dans les en-têtes PNG ou JPEG.

    Renvoie None si les octets ne sont pas identifiables ; ne lève JAMAIS
    (les octets viennent du réseau). PNG : IHDR ; JPEG : premier marqueur
    SOF (dimensions).
    """
    try:
        if octets.startswith(SIGNATURE_PNG) and len(octets) >= 24:
            largeur = int.from_bytes(octets[16:20], "big")
            hauteur = int.from_bytes(octets[20:24], "big")
            if largeur > 0 and hauteur > 0:
                return largeur, hauteur
            return None
        if octets.startswith(SIGNATURE_JPEG):
            position = 2
            while position + 9 <= len(octets):
                if octets[position] != 0xFF:
                    position += 1
                    continue
                marqueur = octets[position + 1]
                if marqueur == 0xFF:
                    position += 1
                    continue
                if marqueur in (0xD8, 0x01) or 0xD0 <= marqueur <= 0xD7:
                    position += 2
                    continue
                if marqueur == 0xD9:  # fin d'image sans SOF
                    return None
                longueur = int.from_bytes(octets[position + 2:position + 4], "big")
                if (0xC0 <= marqueur <= 0xCF
                        and marqueur not in (0xC4, 0xC8, 0xCC)):
                    hauteur = int.from_bytes(octets[position + 5:position + 7], "big")
                    largeur = int.from_bytes(octets[position + 7:position + 9], "big")
                    if largeur > 0 and hauteur > 0:
                        return largeur, hauteur
                    return None
                if longueur <= 0:
                    return None
                position += 2 + longueur
        return None
    except Exception:
        return None


def extraire_image(corps):
    """Tire les octets de l'image du corps JSON : {image_url: data:...}."""
    try:
        donnees = json.loads(corps)
    except (ValueError, UnicodeDecodeError):
        return None, "Corps de requête illisible : du JSON est attendu."
    url = donnees.get("image_url") if isinstance(donnees, dict) else None
    if not isinstance(url, str):
        return None, 'Champ "image_url" absent : indiquez "data:image/png;base64,…".'
    correspondance = MOTIF_DATA_URL.match(url.strip())
    if not correspondance:
        return None, 'Le champ "image_url" doit être une adresse "data:image/png;base64,…".'
    try:
        octets = base64.b64decode(correspondance.group(2), validate=True)
    except (ValueError, TypeError):
        return None, "Image illisible : le contenu base64 est corrompu."
    if not (octets.startswith(SIGNATURE_PNG) or octets.startswith(SIGNATURE_JPEG)):
        return None, "Format d'image non pris en charge : envoyez du PNG."
    return octets, None


class ServeurOcr(ThreadingHTTPServer):
    """v0.1.28 (correctif approuvé) : ne journalise pas les réinitialisations.

    Un client qui referme brutalement la connexion (banc d'essai,
    annulation d'une requête côté application) faisait remonter une
    trace ConnectionResetError (WinError 10054) ou ConnectionAborted
    par thread : ce n'est pas une erreur du serveur, seulement un
    client pressé. Tout autre échec garde la trace habituelle."""

    def handle_error(self, requete, adresse_client):
        exc = sys.exc_info()[1]
        if isinstance(exc, (ConnectionResetError, ConnectionAbortedError)):
            return
        super().handle_error(requete, adresse_client)


class Repondeur(BaseHTTPRequestHandler):
    # Les messages du serveur vont au journal local, jamais au client.
    def log_message(self, format_, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), format_ % args))

    def _repondre(self, code, contenu):
        charge = json.dumps(contenu, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(charge)))
        self.end_headers()
        self.wfile.write(charge)

    def do_GET(self):
        # Une requête GET simple sert de "êtes-vous là ?" (test navigateur).
        self._repondre(200, {"service": "serveur-ocr", "banc": mode_banc})

    def do_POST(self):
        if not autorise(self.headers.get("Authorization"), jeton_actif):
            self._repondre(401, {"erreur": "Jeton absent ou refusé."})
            return
        try:
            longueur = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            longueur = 0
        if longueur <= 0 or longueur > 64 * 1024 * 1024:
            self._repondre(400, {"erreur": "Requête inattendue (taille nulle ou énorme)."})
            return
        chemin = self.path.split("?")[0]
        corps = self.rfile.read(longueur)
        octets, probleme = extraire_image(corps)
        if probleme:
            self._repondre(400, {"erreur": probleme})
            return
        if chemin.endswith("/page"):
            self._reconnaitre_page(octets)
            return
        self._reconnaitre_formule(octets)

    def _reconnaitre_formule(self, octets):
        """POST /ocr (v0.1.23) : une formule -> LaTeX, inchangé."""
        try:
            with verrou_moteur:
                # Le moteur accepte directement les octets de l'image.
                resultat, _duree = charger_moteur()(octets)
        except RuntimeError as err:
            self._repondre(500, {"erreur": str(err)})
            return
        except Exception as err:  # moteur absent, image rejetée, etc.
            self._repondre(500, {"erreur": "Échec de la reconnaissance : %s" % (err,)})
            return
        latex = resultat.get("latex") if isinstance(resultat, dict) else None
        if not isinstance(latex, str) or not latex.strip():
            self._repondre(502, {"erreur": "Le moteur n'a reconnu aucune formule."})
            return
        self._repondre(200, {"latex": latex.strip()})

    def _reconnaitre_page(self, octets):
        """POST /page (v0.1.26) : une page entière -> contrat de blocs."""
        if mode_banc:
            self._repondre(200, PAGE_BANC)
            return
        try:
            import moteur_pages  # passerelle locale (moteur_pages.py)
        except ImportError:
            self._repondre(500, {
                "erreur": "Le moteur de reconnaissance de pages n'est pas "
                "installé. Dans ce dossier : "
                "py -3.12 -m pip install -r requirements.txt"})
            return
        try:
            with verrou_moteur:  # partagé avec /ocr : un moteur à la fois
                resultat = moteur_pages.reconnaitre_page(
                    octets, niveau_actif, diagnostic)
        except Exception as err:  # défensif : la passerelle ne lève jamais
            self._repondre(500, {"erreur": "Échec de la reconnaissance de la page : %s" % (err,)})
            return
        if not isinstance(resultat, dict):
            self._repondre(500, {"erreur": "Échec de la reconnaissance de la page."})
            return
        if "erreur" in resultat:
            self._repondre(500, {"erreur": resultat["erreur"]})
            return
        self._repondre(200, resultat)


def main():
    global mode_banc
    global jeton_actif
    global niveau_actif
    global diagnostic
    analyse = argparse.ArgumentParser(description="Serveur OCR LaTeX personnel d'Atelier PDF.")
    analyse.add_argument("--hote", default="0.0.0.0", help="interface d'écoute (défaut : toutes)")
    analyse.add_argument("--port", type=int, default=8642, help="port d'écoute (défaut : 8642)")
    analyse.add_argument("--banc", action="store_true", help="banc d'essai : moteur factice, réponses fixes")
    analyse.add_argument(
        "--jeton",
        default=os.environ.get("JETON_OCR") or "",
        help="exiger l'en-tête Authorization: Bearer <jeton> sur les POST "
        "(défaut : la variable JETON_OCR, vide = aucun verrou)",
    )
    analyse.add_argument(
        "--niveau",
        choices=["flash", "basic", "standard", "advanced"],
        default="basic",
        help="niveau de reconnaissance des pages POST /page "
        "(défaut : basic)",
    )
    analyse.add_argument(
        "--diagnostic",
        action="store_true",
        help="mode réel /page : journaliser la structure brute renvoyée "
        "par MinerU pour la première page (réglage de moteur_pages.py)",
    )
    options = analyse.parse_args()
    mode_banc = options.banc
    jeton_actif = options.jeton
    niveau_actif = options.niveau
    diagnostic = options.diagnostic
    service = ServeurOcr((options.hote, options.port), Repondeur)
    hote_affiche = options.hote if options.hote != "0.0.0.0" else "toutes les interfaces"
    print("Serveur OCR LaTeX personnel — écoute sur %s, port %d." % (hote_affiche, options.port))
    print("POST /ocr : formule LaTeX ; POST /page : page complète (blocs).")
    if mode_banc:
        print("MODE BANC D'ESSAI : réponses fixes, moteurs désactivés.")
    else:
        print("Le moteur de formules (RapidLaTeXOCR) se chargera au premier appel ;")
        print("le moteur de pages (MinerU), au premier POST /page — la toute")
        print("première reconnaissance télécharge les modèles.")
        print("Niveau de reconnaissance des pages : %s (--niveau flash|basic|standard|advanced)."
              % niveau_actif)
        if diagnostic:
            print("DIAGNOSTIC : la structure brute de la première page reconnue")
            print("sera journalisée (--diagnostic).")
    if jeton_actif:
        print("JETON ACTIF : chaque POST doit porter "
        '"Authorization: Bearer <jeton>" ; GET /ocr reste ouvert.')
    else:
        print("Aucun jeton : le serveur répond à toute requête (comme avant).")
    print("Arrêter : Ctrl+C.")
    try:
        service.serve_forever()
    except KeyboardInterrupt:
        print("\nArrêt.")
        service.server_close()


if __name__ == "__main__":
    main()
