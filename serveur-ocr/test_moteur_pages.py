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

# --- Partie E7 (v0.1.26.1) : schéma Middle JSON 4.x strict, observé au
# premier essai réel (--diagnostic : CodeBlock -> AlgorithmBodyBlock ->
# TextSpan, bbox normalisées). Le dict ci-dessous est la transcription
# to_dict(mode json) exacte de ce que renvoie MinerU 4.2.3 en tiers basic.

# E7a : le cas réel d'Arthur (bloc classé code/algorithm_body, texte dedans).
page_reelle = {"pages": [{"page_idx": 0, "blocks": [
    {"type": "code", "index": 0, "bbox": [0.058, 0.494, 0.925, 0.714],
     "sub_type": "algorithm",
     "content": [
         {"type": "algorithm_body", "bbox": [0.058, 0.494, 0.925, 0.714],
          "content": [
              {"type": "text", "content": "Théorème : Soit (E) l'équation"}]}]}]}]}
page = transformer_page(page_reelle, 1654, 2339)
verifier(18, page["blocs"] and page["blocs"][0]["type"] == "texte",
         "4.x strict : bloc code/algorithm_body -> texte du contrat")
bloc18 = page["blocs"][0] if page["blocs"] else {}
verifier(19, bloc18.get("bbox") == [96, 1155, 1530, 1670]
         and bloc18.get("lignes", [{}])[0].get("mots", [{}])[0].get("texte")
         == "Théorème : Soit (E) l'équation",
         "4.x : bbox normalisées mises à l'échelle (1654x2339) et spans assemblés")

# E7b : titres 4.x (doc_title/paragraph_title) avec spans inline.
titres_4x = [{"type": "doc_title", "index": 0, "bbox": [0.1, 0.1, 0.9, 0.2],
              "level": 1,
              "content": [{"type": "text", "content": "Le titre"}]},
             {"type": "paragraph_title", "index": 1, "bbox": [0.1, 0.3, 0.9, 0.35],
              "level": 2,
              "content": [{"type": "text", "content": "Section"}]}]
page = transformer_page(titres_4x, 1000, 2000)
verifier(20, [b["type"] for b in page["blocs"]] == ["titre", "titre"]
         and page["blocs"][0]["texte"] == "Le titre"
         and page["blocs"][1]["texte"] == "Section",
         "4.x : doc_title et paragraph_title -> titres avec leurs textes")

# E7c : équation 4.x (content chaîne) et tableau 4.x (content -> table_body).
formule_tableau = [
    {"type": "equation", "index": 0, "bbox": [0.5, 0.5, 0.7, 0.55],
     "content": "x^{2}+1"},
    {"type": "table", "index": 1, "bbox": [0.1, 0.6, 0.9, 0.9],
     "content": [
         {"type": "table_body", "bbox": [0.1, 0.6, 0.9, 0.9],
          "content": "<table><tr><td>1</td></tr></table>"}]},
]
page = transformer_page(formule_tableau, 800, 600)
verifier(21, [b["type"] for b in page["blocs"]] == ["formule", "tableau"]
         and page["blocs"][0]["latex"] == "x^{2}+1"
         and page["blocs"][1]["html"] == "<table><tr><td>1</td></tr></table>",
         "4.x : equation (content) -> formule ; table -> table_body -> html")

# E7d : équations inline encadrées $…$, habillage (header/footer) ignoré.
texte_inline = [{"type": "text", "index": 0, "bbox": [0.1, 0.1, 0.9, 0.3],
                 "content": [
                     {"type": "text", "content": "le mot "},
                     {"type": "equation_inline", "content": "a+b"}]},
                {"type": "header", "index": 1, "bbox": [0.1, 0.0, 0.9, 0.05],
                 "content": [{"type": "text", "content": "numéro de page"}]}]
page = transformer_page(texte_inline, 100, 100)
verifier(22, len(page["blocs"]) == 1
         and page["blocs"][0]["lignes"][0]["mots"][0]["texte"]
         == "le mot $a+b$",
         "4.x : équation inline assemblée en $…$ ; header ignoré")

# E7e : _vers_dict préfère la conversion OFFICIELLE to_dict du SDK.


class _FauxResultat(object):
    """ParseResult factice du SDK 4.x : pages en modèles pydantic."""

    def to_dict(self):
        return {"pages": [{"page_idx": 0, "blocks": [
            {"type": "text", "index": 0, "bbox": [0.1, 0.1, 0.2, 0.2],
             "content": [{"type": "text", "content": "via to_dict"}]}]}]}


from moteur_pages import _vers_dict  # noqa: E402
conv = _vers_dict(_FauxResultat())
page = transformer_page(conv, 100, 100)
verifier(23, page["blocs"] and page["blocs"][0]["type"] == "texte"
         and page["blocs"][0]["lignes"][0]["mots"][0]["texte"] == "via to_dict",
         "_vers_dict : l'objet du SDK est converti par sa méthode to_dict")

if echecs:
    print("\n%s vérification(s) en échec." % echecs)
    sys.exit(1)
print("\nToutes les vérifications sont vertes.")
