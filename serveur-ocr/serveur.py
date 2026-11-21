# serveur-ocr/serveur.py — v0.1.23 : serveur OCR LaTeX personnel.
# Fait tourner, sur VOTRE ordinateur, le moteur RapidLaTeXOCR (MIT) qui
# transforme l'image d'une formule en code LaTeX. Atelier PDF (sur un autre
# ordinateur, y compris par le réseau privé Tailscale) lui POSTe l'image de
# la zone sélectionnée ; rien ne quitte vos machines.
#
# Usage :
#   python serveur.py            # écoute sur toutes les interfaces, port 8642
#   python serveur.py --port 9000
#   python serveur.py --banc     # mode banc d'essai : réponses fixes, SANS
#                                # moteur (pour vérifier l'URL, Tailscale et
#                                # le pare-feu AVANT d'installer le modèle)
#
# Dépendances (hors mode --banc) : voir requirements.txt.
# Voir LISEZMOI.md pour l'installation complète.

import argparse
import base64
import json
import re
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# L'URL attendue dans le corps de la requête : une adresse "data" PNG.
MOTIF_DATA_URL = re.compile(r"^data:image/(png|jpeg);base64,([A-Za-z0-9+/=]+)$")
SIGNATURE_PNG = b"\x89PNG\r\n\x1a\n"
SIGNATURE_JPEG = b"\xff\xd8\xff"

verrou_moteur = threading.Lock()   # le moteur ONNX est appelé UNE requête à la fois
moteur = None                      # construit au premier appel (télécharge les
mode_banc = False                  # modèles la toute première fois)


def charger_moteur():
    """Importe et construit le moteur (ou le banc d'essai)."""
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
        try:
            longueur = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            longueur = 0
        if longueur <= 0 or longueur > 64 * 1024 * 1024:
            self._repondre(400, {"erreur": "Requête inattendue (taille nulle ou énorme)."})
            return
        corps = self.rfile.read(longueur)
        octets, probleme = extraire_image(corps)
        if probleme:
            self._repondre(400, {"erreur": probleme})
            return
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


def main():
    global mode_banc
    analyse = argparse.ArgumentParser(description="Serveur OCR LaTeX personnel d'Atelier PDF.")
    analyse.add_argument("--hote", default="0.0.0.0", help="interface d'écoute (défaut : toutes)")
    analyse.add_argument("--port", type=int, default=8642, help="port d'écoute (défaut : 8642)")
    analyse.add_argument("--banc", action="store_true", help="banc d'essai : moteur factice, réponses fixes")
    options = analyse.parse_args()
    mode_banc = options.banc
    service = ThreadingHTTPServer((options.hote, options.port), Repondeur)
    hote_affiche = options.hote if options.hote != "0.0.0.0" else "toutes les interfaces"
    print("Serveur OCR LaTeX personnel — écoute sur %s, port %d." % (hote_affiche, options.port))
    if mode_banc:
        print("MODE BANC D'ESSAI : réponses fixes, moteur désactivé.")
    else:
        print("Le moteur (RapidLaTeXOCR) se chargera au premier appel ;")
        print("la toute première reconnaissance télécharge les modèles.")
    print("Arrêter : Ctrl+C.")
    try:
        service.serve_forever()
    except KeyboardInterrupt:
        print("\nArrêt.")
        service.server_close()


if __name__ == "__main__":
    main()
