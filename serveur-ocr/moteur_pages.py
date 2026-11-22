# serveur-ocr/moteur_pages.py — passerelle vers le paquet MinerU (v0.1.26.1).
#
# Correctif v0.1.26.1 (22 nov., après le premier essai réel d'Arthur) :
# MinerU 4.2.3 (tiers basic) renvoie un ParseResult dont les pages sont des
# modèles pydantic STRICTS (docvortex.schema : CodeBlock, TextBlock,
# EquationBlock, TextSpan…), avec des bbox NORMALISÉES (0 a 1) et une
# imbrication blocks -> content -> sous-blocs -> spans inline. La passerelle
# convertit désormais le résultat par la méthode OFFICIELLE to_dict(mode
# json) du SDK, puis lit les DEUX schémas : middle json 3.x (blocks plats
# avec lines/spans) et middle json 4.x strict (content de spans inline).
# Ce fichier est LOCAL au serveur (il ne s'appelle PAS « mineru.py » : ce
# nom occulterait le paquet pip dans sys.path). Toute la logique de
# transformation est PURE et testable sans MinerU (test_moteur_pages.py) ;
# seul reconnaitre_page touche le paquet, et seulement en paresseux.
#
# Sortie (contrat /page de serveur.py) :
#   {"largeur": n, "hauteur": n, "blocs": [
#     {"type": "titre",   "bbox": [x0,y0,x1,y1], "texte": "…"},
#     {"type": "texte",   "bbox": […], "lignes": [{"bbox": […],
#        "mots": [{"bbox": […], "texte": "…"}]}]},
#     {"type": "formule", "bbox": […], "latex": "…"},
#     {"type": "tableau", "bbox": […], "html": "…"},
#     {"type": "image",   "bbox": […]}   ← bbox seule, jamais de pixels
#   ]}
#
# Le schéma réel de MinerU 4.x sera vérifié chez vous au premier appel
# avec le drapeau --diagnostic du serveur (structure brute journalisée) ;
# si le schéma dévie, un correctif v0.1.26.x ajustera les correspondances.

import json
import os
import sys
import tempfile

SIGNATURE_PNG = b"\x89PNG\r\n\x1a\n"
SIGNATURE_JPEG = b"\xff\xd8\xff"

MESSAGE_INSTALL = (
    "Le moteur de reconnaissance de pages (MinerU) n'est pas installé. "
    "Dans ce dossier : py -3.12 -m pip install -r requirements.txt"
)


def lire_taille_image(octets):
    """(largeur, hauteur) lues dans les en-têtes PNG ou JPEG, ou None.

    Ne lève JAMAIS (les octets viennent du réseau).
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


def _texte_de(bloc, cles):
    """Première valeur texte exploitable parmi les clés données.

    v0.1.26.1 : au schéma 3.x (chaînes aux clés text/content) s'ajoute le
    schéma 4.x strict, où « content » est une LISTE de spans inline
    ({type: "text"|"equation_inline"|…, content: str}) voire de sous-blocs
    imbriqués : la valeur liste est alors assemblée par _texte_imbrique.
    """
    if not isinstance(bloc, dict):
        return ""
    for cle in cles:
        valeur = bloc.get(cle)
        if isinstance(valeur, str) and valeur.strip():
            return valeur.strip()
        if isinstance(valeur, list):
            texte = _texte_imbrique(valeur)
            if texte:
                return texte
    return ""


def _texte_imbrique(contenu, profondeur=0):
    """Assemble récursivement le texte d'un « content » du schéma 4.x.

    Spans inline de texte, équations inline (encadrées $…$ au contrat),
    sous-blocs (code/algorithm_body…), liens ; tout le reste est ignoré.
    Ne lève jamais ; profondeur bornée contre les cycles.
    """
    morceaux = []
    try:
        if isinstance(contenu, str):
            return contenu.strip()
        if not isinstance(contenu, list) or profondeur > 8:
            return ""
        for item in contenu:
            if isinstance(item, str):
                morceaux.append(item)  # brut : les espaces séparent les mots
                continue
            if not isinstance(item, dict):
                continue
            genre = item.get("type")
            interne = item.get("content")
            if genre == "equation_inline" and isinstance(interne, str) \
                    and interne.strip():
                morceaux.append("$%s$" % interne)  # latex brut, non strippé
                continue
            if isinstance(interne, str):
                morceaux.append(interne)  # brut ; strip final seulement
                continue
            if interne is None:
                interne = item.get("spans")
            texte = _texte_imbrique(interne, profondeur + 1)
            if texte:
                morceaux.append(texte)
    except Exception:
        return ""
    return "".join(morceaux).strip()


def _html_de_tableau(bloc):
    """HTML d'un bloc tableau, schéma 3.x (table_body/html) ou 4.x strict.

    Le 4.x range le corps dans content -> fils de type table_body, dont
    le champ content porte le HTML en chaîne.
    """
    if not isinstance(bloc, dict):
        return ""
    for cle in ("table_body", "html"):
        valeur = bloc.get(cle)
        if isinstance(valeur, str) and valeur.strip():
            return valeur.strip()
    return _texte_imbrique(bloc.get("content"))


def _bbox_entiere(brute, largeur, hauteur):
    """bbox -> [x0, y0, x1, y1] entiers, ordonnés, écrêtés ; None si absente.

    Ne lève jamais ; échange les bornes inversées au lieu de rejeter.
    """
    try:
        if not isinstance(brute, (list, tuple)) or len(brute) != 4:
            return None
        valeurs = []
        for valeur in brute:
            if isinstance(valeur, bool) or not isinstance(valeur, (int, float)):
                return None
            valeurs.append(float(valeur))
        if valeurs and max(valeurs) <= 1.0 and largeur > 1 and hauteur > 1:
            # v0.1.26.1 : bbox NORMALISÉES (0 a 1) du schéma 4.x strict,
            # mises à l'échelle de la page AVANT l'arrondi ; les bbox en
            # pixels (presque toujours > 1) restent inchangées.
            valeurs = [valeurs[0] * largeur, valeurs[1] * hauteur,
                       valeurs[2] * largeur, valeurs[3] * hauteur]
        valeurs = [int(round(valeur)) for valeur in valeurs]
        x0, y0, x1, y1 = valeurs
        if x0 > x1:
            x0, x1 = x1, x0
        if y0 > y1:
            y0, y1 = y1, y0
        if largeur > 0:  # dimensions connues : écrêtage dans la page
            x0 = max(0, min(x0, largeur))
            x1 = max(0, min(x1, largeur))
        if hauteur > 0:
            y0 = max(0, min(y0, hauteur))
            y1 = max(0, min(y1, hauteur))
        if x0 >= x1 or y0 >= y1:  # devenue vide : bloc sans surface
            return None
        return [x0, y0, x1, y1]
    except Exception:
        return None


def _ligne_de(bloc, ligne, largeur, hauteur):
    """Une ligne du contrat : {"bbox": […], "mots": […]} ou None."""
    if not isinstance(ligne, dict):
        ligne = {}
    bbox = _bbox_entiere(ligne.get("bbox") or bloc.get("bbox"),
                         largeur, hauteur)
    if bbox is None:
        return None
    mots = []
    spans = ligne.get("spans") or ligne.get("words")
    if isinstance(spans, list) and spans:
        for span in spans:
            if not isinstance(span, dict):
                continue
            texte = _texte_de(span, ("content", "text", "text_content"))
            if not texte:
                continue
            bbox_mot = _bbox_entiere(span.get("bbox"), largeur, hauteur) or bbox
            mots.append({"bbox": bbox_mot, "texte": texte})
    else:
        texte = _texte_de(ligne, ("content", "text", "text_content")) \
            or _texte_de(bloc, ("content", "text", "text_content"))
        if not texte:
            return None
        mots.append({"bbox": bbox, "texte": texte})
    return {"bbox": bbox, "mots": mots}


def _bloc_de(bloc, largeur, hauteur):
    """Un bloc MinerU -> un bloc du contrat, ou None si inexploitable."""
    if not isinstance(bloc, dict):
        return None
    bbox = _bbox_entiere(bloc.get("bbox"), largeur, hauteur)
    if bbox is None:
        return None  # jamais de boîte inventée
    type_mineru = bloc.get("type")
    if type_mineru in ("title", "doc_title", "section_title",
                       "paragraph_title"):  # v0.1.26.1 : titres 4.x
        texte = _texte_de(bloc, ("text", "content", "text_content"))
        if not texte:
            return None
        return {"type": "titre", "bbox": bbox, "texte": texte}
    if type_mineru in ("text", "code", "code_body", "algorithm_body",
                       "ref_text", "aside_text"):
        lignes = []
        brutes = bloc.get("lines")
        if isinstance(brutes, list) and brutes:
            for ligne in brutes:
                construite = _ligne_de(bloc, ligne, largeur, hauteur)
                if construite is not None:
                    lignes.append(construite)
        if not lignes:
            construite = _ligne_de(bloc, {}, largeur, hauteur)
            if construite is not None:
                lignes.append(construite)
        if not lignes:
            return None
        return {"type": "texte", "bbox": bbox, "lignes": lignes}
    if type_mineru in ("equation", "interline_equation"):
        latex = _texte_de(bloc, ("latex", "text", "content"))
        if not latex:
            return None
        return {"type": "formule", "bbox": bbox, "latex": latex}
    if type_mineru == "table":
        html = _html_de_tableau(bloc)  # v0.1.26.1 : 3.x et 4.x strict
        if not html:
            return None
        return {"type": "tableau", "bbox": bbox, "html": html}
    if type_mineru == "image":
        return {"type": "image", "bbox": bbox}
    return None  # type inconnu : ignoré, jamais fatal


def _blocs_de(contenu):
    """Extrait défensivement la liste des blocs, sans lever."""
    if isinstance(contenu, dict):
        pages = contenu.get("pages")
        if isinstance(pages, list) and pages:
            premiere = pages[0]
            if isinstance(premiere, dict):
                blocs = premiere.get("blocks") or premiere.get("para_blocks")
                if isinstance(blocs, list):
                    return blocs
                return []
        blocs = contenu.get("blocks") or contenu.get("para_blocks") \
            or contenu.get("content_list")
        return blocs if isinstance(blocs, list) else []
    if isinstance(contenu, list):
        return contenu
    if hasattr(contenu, "pages"):  # variantes SDK 4.x
        try:
            pages = list(contenu.pages)
            if pages:
                premiere = pages[0]
                if isinstance(premiere, dict):
                    blocs = premiere.get("blocks")
                    return blocs if isinstance(blocs, list) else []
                return []
        except Exception:
            return []
        return []
    if hasattr(contenu, "content_list"):
        try:
            blocs = contenu.content_list
            return blocs if isinstance(blocs, list) else []
        except Exception:
            return []
    return []


def transformer_page(contenu, largeur, hauteur):
    """Sortie MinerU (défensive) -> contrat du serveur. PURE : ne lève jamais.

    Tout ce qui n'est pas compris est ignoré ; une page sans bloc exploitable
    donne {"blocs": []} ; l'app recadre elle-même les images depuis les bbox.
    """
    largeur = int(largeur or 0)
    hauteur = int(hauteur or 0)
    sortis = []
    try:
        for bloc in _blocs_de(contenu):
            contruit = _bloc_de(bloc, largeur, hauteur)
            if contruit is not None:
                sortis.append(contruit)
    except Exception:
        sortis = []
    return {"largeur": largeur, "hauteur": hauteur, "blocs": sortis}


def _journal_diagnostic(premiere):
    """--diagnostic : structure brute tronquée, vers le journal du serveur."""
    try:
        brut = json.dumps(premiere, ensure_ascii=False, default=str)
    except Exception:
        brut = str(premiere)
    sys.stderr.write("PAGE BRUTE (diagnostic, tronquée) : %s\n"
                     % brut[:4000])


def _vers_dict(resultat):
    """v0.1.26.1 : ParseResult du SDK 4.x -> dictionnaire (mode json).

    Le SDK expose la conversion OFFICIELLE to_dict() (pydantic mode json :
    enums en chaînes, tuples en listes, tout devient des dict purs), qui
    évite de deviner la structure interne des objets pydantic. En cas
    d'échec ou d'absence, None : l'appelant garde l'objet tel quel et
    l'ancien chemin défensif s'applique (le diagnostic le journalise).
    """
    try:
        if isinstance(resultat, (dict, list)):
            return resultat
        convertisseur = getattr(resultat, "to_dict", None)
        if callable(convertisseur):
            return convertisseur()
        middle = getattr(resultat, "middle_json", None)
        convertisseur = getattr(middle, "to_dict", None)
        if callable(convertisseur):
            return convertisseur()
    except Exception:
        return None
    return None


def reconnaitre_page(octets, niveau="basic", diagnostic=False):
    """Octets d'une page -> contrat complet, ou {"erreur": str} ; ne lève jamais.

    Le paquet pip MinerU est importé paresseux ; il ne se charge qu'au
    premier POST /page réel (et télécharge ses modèles la toute première
    fois). dimension : lues dans les octets (repli 0 : inconnues).
    """
    if not isinstance(octets, (bytes, bytearray)):
        return {"erreur": "Image absente ou illisible."}
    octets = bytes(octets)
    taille = lire_taille_image(octets)
    largeur, hauteur = taille if taille else (0, 0)
    try:
        from mineru.parser import parse  # le paquet pip, pas ce fichier
    except ImportError:
        return {"erreur": MESSAGE_INSTALL}
    if octets.startswith(SIGNATURE_PNG):
        suffixe = ".png"
    elif octets.startswith(SIGNATURE_JPEG):
        suffixe = ".jpg"
    else:
        return {"erreur": "Format d'image non pris en charge : envoyez du PNG."}
    chemin = None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffixe, delete=False) as fichier:
            fichier.write(octets)
            chemin = fichier.name
        resultat = parse(chemin, tier=niveau)
        conv = _vers_dict(resultat)
        premiere = _blocs_de_source(conv if conv is not None else resultat)
        if diagnostic:
            _journal_diagnostic(premiere)
        return transformer_page(premiere, largeur, hauteur)
    except Exception as err:  # GPU absent, OOM, image rejetée, schéma inconnu
        return {"erreur": "Échec de la reconnaissance de la page : %s" % (err,)}
    finally:
        if chemin:
            try:
                os.unlink(chemin)
            except OSError:
                pass


def _blocs_de_source(resultat):
    """Première page (ou liste de blocs) depuis la sortie de parse, sans lever.

    Variantes acceptées : objet ParseResult du SDK 4.x (attributs pages /
    content_list), dictionnaire {pages: […]}, liste de blocs, liste de
    chaînes (content list 4.x). Le --diagnostic journalise la structure
    retenue pour régler le schéma réel à l'installation.
    """
    try:
        if isinstance(resultat, (dict, list)):
            return resultat
        pages = getattr(resultat, "pages", None)
        if isinstance(pages, list) and pages:
            premiere = pages[0]
            return premiere if isinstance(premiere, (dict, list)) else pages
        contenu = getattr(resultat, "content_list", None)
        if not isinstance(contenu, list):
            contenu = getattr(resultat, "contentlist", None)
        if isinstance(contenu, list):
            return contenu
        return resultat
    except Exception:
        return []
