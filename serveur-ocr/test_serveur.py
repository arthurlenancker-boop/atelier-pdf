# serveur-ocr/test_serveur.py — banc d'essai du serveur OCR (mode --banc).
# Aucune dépendance : bibliothèque standard uniquement. Le moteur
# RapidLaTeXOCR n'est PAS requis (le serveur est lancé en mode --banc),
# et le moteur de pages (v0.1.26) non plus : la partie C teste la page
# factice du banc.
#
# Usage : py -3.12 serveur-ocr/test_serveur.py [--port 18642]
# Vérifie (chaque ligne imprimée, échec compté, exit 0 si tout vert) :
#   sans --jeton  : GET 200 ; POST /ocr 200 sans en-tête ; POST /ocr 200
#                   même avec un en-tête Bearer quelconque (rétrocompat) ;
#                   POST /ocr/page 200 avec la page factice complète
#                   (structure, 5 types, bbox saines, lignes et mots).
#   avec --jeton  : GET 200 sans en-tête ; POST /ocr 401 sans en-tête ;
#                   POST /ocr 200 avec le bon jeton ; POST /ocr 401 avec
#                   un mauvais jeton ; POST /ocr/page 401 avec un mauvais
#                   jeton (avant lecture du corps).

import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

DOSSIER = os.path.dirname(os.path.abspath(__file__))
CORPS = json.dumps(
    {"image_url": "data:image/png;base64,iVBORw0KGgo="}
).encode("utf-8")
PORT = 18642

for i, argument in enumerate(sys.argv):
    if argument == "--port" and i + 1 < len(sys.argv):
        PORT = int(sys.argv[i + 1])

BASE = "http://127.0.0.1:%d" % PORT


def requete(entetes=None, corps=None, chemin="/ocr"):
    """Un GET si corps est None, un POST sinon ; renvoie (statut, JSON)."""
    req = urllib.request.Request(
        BASE + chemin, data=corps, method="POST" if corps is not None else "GET"
    )
    for cle, valeur in (entetes or {}).items():
        req.add_header(cle, valeur)
    try:
        with urllib.request.urlopen(req, timeout=10) as reponse:
            return reponse.status, json.loads(reponse.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        return err.code, json.loads(err.read().decode("utf-8"))


def attendre_dispo(processus, delai=20):
    """Attend que GET /ocr réponde ; False si le serveur meurt avant."""
    for _ in range(delai * 10):
        if processus.poll() is not None:
            return False
        try:
            with urllib.request.urlopen(BASE + "/ocr", timeout=1):
                return True
        except Exception:
            time.sleep(0.1)
    return False


def lancer(arguments):
    commande = [sys.executable, "serveur.py", "--banc", "--port", str(PORT)]
    commande += arguments
    processus = subprocess.Popen(commande, cwd=DOSSIER)
    return processus, attendre_dispo(processus)


echecs = 0


def verifier(numero, condition, detail):
    global echecs
    if condition:
        print("OK %d : %s" % (numero, detail))
    else:
        echecs += 1
        print("ÉCHEC %d : %s" % (numero, detail))


def bbox_saine(b, l, h):
    """4 entiers x0<=x1, y0<=y1, tous dans la page."""
    if not isinstance(b, list) or len(b) != 4:
        return False
    if not all(isinstance(v, int) for v in b):
        return False
    x0, y0, x1, y1 = b
    return 0 <= x0 <= x1 <= l and 0 <= y0 <= y1 <= h


def page_saine(page):
    """Toutes les bbox (blocs, lignes, mots) sont saines dans la page."""
    l = page.get("largeur")
    h = page.get("hauteur")
    if not (isinstance(l, int) and isinstance(h, int) and l > 0 and h > 0):
        return False
    for bloc in page.get("blocs", []):
        if not isinstance(bloc, dict) or not bbox_saine(bloc.get("bbox"), l, h):
            return False
        if bloc.get("type") == "texte":
            for ligne in bloc.get("lignes", []):
                if not isinstance(ligne, dict) or not bbox_saine(ligne.get("bbox"), l, h):
                    return False
                for mot in ligne.get("mots", []):
                    if not isinstance(mot, dict) or not bbox_saine(mot.get("bbox"), l, h):
                        return False
    return True


# --- Partie A : serveur SANS jeton (comportement v0.1.23 inchangé) ---
processus, dispo = lancer([])
verifier(1, dispo, "le serveur répond (GET /ocr sans jeton)")
if dispo:
    statut, _ = requete()
    verifier(1, statut == 200, "GET /ocr sans en-tête -> 200 (état affiché)")
    statut, reponse = requete(corps=CORPS)
    verifier(2, statut == 200 and "latex" in reponse,
             "POST /ocr sans en-tête -> 200 avec latex (banc)")
    statut, reponse = requete(
        entetes={"Authorization": "Bearer nimporte"}, corps=CORPS
    )
    verifier(3, statut == 200 and "latex" in reponse,
             "POST /ocr avec Bearer quelconque -> 200 quand même "
             "(un serveur sans jeton ignore l'en-tête)")
processus.terminate()
processus.wait()

# --- Partie C : endpoint /page en mode banc, SANS jeton (v0.1.26) ---
processus, dispo = lancer([])
verifier(8, dispo, "le serveur pour /page répond")
if dispo:
    statut, page = requete(corps=CORPS, chemin="/ocr/page")
    verifier(8, statut == 200 and all(
        cle in page for cle in ("largeur", "hauteur", "blocs")),
        "POST /ocr/page -> 200 avec largeur, hauteur et blocs")
    verifier(9, [b.get("type") for b in page.get("blocs", [])]
             == ["titre", "texte", "formule", "tableau", "image"],
             "5 blocs dans l'ordre : titre, texte, formule, tableau, image")
    verifier(10, page_saine(page),
             "toutes les bbox : 4 entiers ordonnés, tous dans la page")
    texte = next((b for b in page.get("blocs", []) if b.get("type") == "texte"), {})
    lignes = texte.get("lignes", [])
    verifier(11, len(lignes) == 2 and all(
        isinstance(ligne.get("mots"), list) and ligne.get("mots")
        for ligne in lignes),
        "le bloc texte porte 2 lignes, chacune avec ses mots")
processus.terminate()
processus.wait()

# --- Partie B : serveur AVEC --jeton secret123 ---
processus, dispo = lancer(["--jeton", "secret123"])
verifier(4, dispo, "le serveur avec --jeton répond")
if dispo:
    statut, _ = requete()
    verifier(4, statut == 200,
             "GET /ocr sans en-tête -> 200 (diagnostic toujours ouvert)")
    statut, reponse = requete(corps=CORPS)
    verifier(5, statut == 401 and reponse.get("erreur") == "Jeton absent ou refusé.",
             "POST /ocr sans en-tête -> 401 avec le message français")
    statut, reponse = requete(
        entetes={"Authorization": "Bearer secret123"}, corps=CORPS
    )
    verifier(6, statut == 200 and "latex" in reponse,
             "POST /ocr avec le bon jeton -> 200 avec latex")
    statut, reponse = requete(
        entetes={"Authorization": "Bearer mauvais"}, corps=CORPS
    )
    verifier(7, statut == 401, "POST /ocr avec un mauvais jeton -> 401")
    statut, reponse = requete(
        entetes={"Authorization": "Bearer mauvais"}, corps=CORPS,
        chemin="/ocr/page"
    )
    verifier(12, statut == 401 and reponse.get("erreur") == "Jeton absent ou refusé.",
             "POST /page avec un mauvais jeton -> 401 AVANT lecture du corps")
processus.terminate()
processus.wait()

if echecs:
    print("\n%s vérification(s) en échec." % echecs)
    sys.exit(1)
print("\nToutes les vérifications sont vertes.")
