# serveur-ocr/test_moteur_pages.py — tests de la passerelle MinerU
# (serveur-ocr/moteur_pages.py), v0.1.26. Bibliothèque standard
# UNIQUEMENT : le paquet pip « mineru » n'est PAS requis ni importé
# ici ; transformer_page et lire_taille_image sont des fonctions pures.
#
# Usage : py -3.12 serveur-ocr/test_moteur_pages.py
# Vérifications (échec compté, exit 0 si tout vert) :
#   E : transformer_page — mapping des types MinerU vers le contrat
#       (titre/texte/formule/tableau/image), lignes et mots depuis les
#       spans, texte sans lignes -> 1 ligne 1 mot, types inconnus et
#       bbox absentes ignorés, écrêtage dans la page, page vide ;
#   F : lire_taille_image (PNG/JPEG, octets quelconques) et
#       reconnaitre_page qui ne lève jamais (paquet absent : erreur
#       française ; paquet présent : contrat ou erreur, sans exception).

import os
import sys

DOSSIER = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, DOSSIER)

from moteur_pages import (  # noqa: E402
    lire_taille_image,
    reconnaitre_page,
    transformer_page,
)

echecs = 0


def verifier(numero, condition, detail):
    global echecs
    if condition:
        print("OK %d : %s" % (numero, detail))
    else:
        echecs += 1
        print("ÉCHEC %d : %s" % (numero, detail))


# --- Partie E : transformer_page (pure) ---

# E1 : sortie complète façon « middle.json » (dictionnaire pages/blocks).
contenu_middle = {"pages": [{"blocks": [
    {"type": "title", "bbox": [100.0, 50.2, 400.7, 100.9], "text": "Un titre"},
    {"type": "text", "bbox": [100.0, 150.0, 400.0, 200.0], "lines": [
        {"bbox": [100.0, 150.0, 400.0, 175.0], "spans": [
            {"bbox": [100.0, 150.0, 180.0, 175.0], "content": "Mot"}]},
        {"bbox": [100.0, 180.0, 400.0, 200.0], "spans": [
            {"bbox": [100.0, 180.0, 160.0, 200.0], "content": "Autre"}]}]},
    {"type": "equation", "bbox": [100.0, 250.0, 300.0, 300.0],
     "text": "x^{2}"},
    {"type": "table", "bbox": [100.0, 350.0, 500.0, 450.0],
     "table_body": "<table><tr><td>1</td></tr></table>"},
    {"type": "image", "bbox": [100.0, 500.0, 400.0, 700.0]},
]}]}
page = transformer_page(contenu_middle, 1000, 2000)
verifier(1, page.get("largeur") == 1000 and page.get("hauteur") == 2000,
         "les dimensions demandées garnissent le contrat")
types = [b.get("type") for b in page.get("blocs", [])]
verifier(2, types == ["titre", "texte", "formule", "tableau", "image"],
         "les 5 types reconnus, dans l'ordre d'entrée : "
         "titre, texte, formule, tableau, image")
titre = page["blocs"][0]
verifier(3, titre.get("texte") == "Un titre"
         and titre.get("bbox") == [100, 50, 401, 101],
         "titre : texte reporté, bbox aplatie en 4 entiers (arrondis)")
texte = page["blocs"][1]
verifier(4, len(texte.get("lignes", [])) == 2
         and texte["lignes"][0]["mots"][0]["texte"] == "Mot"
         and texte["lignes"][1]["mots"][0]["texte"] == "Autre",
         "texte : 2 lignes, mots reportés depuis les spans")
formule = page["blocs"][2]
verifier(5, formule.get("latex") == "x^{2}",
         "formule : le champ text devient latex")
tableau = page["blocs"][3]
verifier(6, tableau.get("html") == "<table><tr><td>1</td></tr></table>",
         "tableau : html reporté depuis table_body")
image = page["blocs"][4]
verifier(7, set(image.keys()) == {"type", "bbox"},
         "image : bbox seule, JAMAIS de pixels dans la sortie")

# E2 : texte sans « lines » -> UNE ligne, UN mot, bbox de la ligne.
contenu_plat = [
    {"type": "text", "bbox": [10, 20, 300, 60],
     "text": "Une phrase entière sans lignes."}]
page = transformer_page(contenu_plat, 500, 400)
texte = page["blocs"][0]
verifier(8, page.get("blocs", [])
         and len(texte["lignes"]) == 1
         and len(texte["lignes"][0]["mots"]) == 1
         and texte["lignes"][0]["mots"][0]["texte"]
         == "Une phrase entière sans lignes."
         and texte["lignes"][0]["bbox"] == [10, 20, 300, 60],
         "texte sans lignes -> 1 ligne 1 mot portant la bbox (aucune boîte inventée)")

# E3 : types inconnus ignorés, bbox absentes ignorées.
contenu_piege = [
    {"type": "header", "bbox": [1, 2, 3, 4], "text": "inconnu"},
    {"type": "text", "text": "bbox absente"},
    {"type": "titre sans type connu", "bbox": [1, 2, 3, 4]},
]
page = transformer_page(contenu_piege, 500, 400)
verifier(9, page.get("blocs") == [],
         "types inconnus et bbox absentes -> aucun bloc (jamais d'exception)")

# E4 : page vide.
page = transformer_page({"pages": [{"blocks": []}]}, 100, 200)
verifier(10, page == {"largeur": 100, "hauteur": 200, "blocs": []},
         "page vide -> contrat avec blocs vides")

# E5 : interline_equation, équation au champ latex, tableau au champ html.
contenu_variantes = [
    {"type": "interline_equation", "bbox": [10, 10, 90, 40],
     "latex": "a+b"},
    {"type": "table", "bbox": [10, 50, 90, 90],
     "html": "<table><tr><td>x</td></tr></table>"},
]
page = transformer_page(contenu_variantes, 200, 200)
verifier(11, [b["type"] for b in page["blocs"]] == ["formule", "tableau"]
         and page["blocs"][0]["latex"] == "a+b"
         and page["blocs"][1]["html"] == "<table><tr><td>x</td></tr></table>",
         "interline_equation -> formule (latex), tableau au champ html")

# E6 : écrêtage des bbox dans la page et ordre forcé.
page = transformer_page(
    [{"type": "image", "bbox": [-20, -30, 2000, 3000]}], 1000, 2000)
verifier(12, page["blocs"][0]["bbox"] == [0, 0, 1000, 2000],
         "bbox hors page -> écrêtée dans la page, ordre conservé")

# --- Partie F : lire_taille_image et reconnaitre_page ---

entete_png = (b"\x89PNG\r\n\x1a\n" + b"\x00\x00\x00\x0d" + b"IHDR"
              + (1234).to_bytes(4, "big") + (5678).to_bytes(4, "big"))
verifier(13, lire_taille_image(entete_png) == (1234, 5678),
         "PNG : (largeur, hauteur) lues dans IHDR")

entete_jpeg = (b"\xff\xd8\xff\xc0\x00\x11\x08"
               + (500).to_bytes(2, "big") + (250).to_bytes(2, "big"))
verifier(14, lire_taille_image(entete_jpeg) == (250, 500),
         "JPEG : (largeur, hauteur) lues dans le premier SOF")

verifier(15, lire_taille_image(b"n'importe quoi") is None
         and lire_taille_image(entete_png[:12]) is None
         and lire_taille_image(b"") is None,
         "octets quelconques ou tronqués -> None, jamais d'exception")

# reconnaitre_page ne lève jamais. Dans le bac (paquet mineru absent)
# elle renvoie l'erreur française d'installation ; avec le paquet
# installé, elle renvoie un contrat ou une erreur, sans exception.
message_mineru_absent = False
try:
    import mineru  # noqa: F401
except ImportError:
    message_mineru_absent = True
resultat = reconnaitre_page(entete_png, "basic")
if message_mineru_absent:
    verifier(16, isinstance(resultat, dict) and "erreur" in resultat
             and "requirements.txt" in resultat["erreur"],
             "paquet mineru absent -> erreur française citant requirements.txt")
else:
    verifier(16, isinstance(resultat, dict),
             "reconnaitre_page renvoie toujours un dictionnaire (jamais d'exception)")

try:
    reconnaitre_page(b"", "flash")
    verification = True
except Exception:
    verification = False
verifier(17, verification, "reconnaitre_page sur octets vides : aucune exception")

if echecs:
    print("\n%s vérification(s) en échec." % echecs)
    sys.exit(1)
print("\nToutes les vérifications sont vertes.")
