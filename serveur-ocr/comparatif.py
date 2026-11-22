# serveur-ocr/comparatif.py — banc d'essai des niveaux de MinerU (v0.1.26.2).
#
# Correctif v0.1.26.2 (22 nov.) : la sortie du parse était passée
# directement à _blocs_de_source sans la conversion _vers_dict du
# correctif v0.1.26.1 : les blocs pydantic stricts de MinerU 4.2.3 arrivaient en
# objets et aucun n'était exploitable (« 0 bloc » aux six essais réels
# d'Arthur). La conversion officielle to_dict est désormais insérée.
# Compare les niveaux (basic, standard…) sur des pages réelles, chez vous,
# sur le PC qui fera tourner le serveur : chronomètre chaque page, rend le
# texte en Markdown (comparer à l'œil) et sauvegarde le contrat v2 (le JSON
# du endpoint /page, sorti de transformer_page).
#
# Usage (depuis le dossier du dépôt ou de l'app) :
#   py -3.12 serveur-ocr/comparatif.py page1.png page2.png page3.png
#   py -3.12 serveur-ocr/comparatif.py *.png --niveaux basic,standard
#   py -3.12 serveur-ocr/comparatif.py page.png --niveaux basic --sortie mon-essai
#
# Sortie : dossier comparatif-AAAA-MM-JJ/ (ou --sortie) avec, pour chaque
# page × niveau : <page>-<niveau>.md (texte reconnu, titres en #, formules
# en $$…$$, tableaux en HTML) et <page>-<niveau>.json (contrat v2) ; la
# console affiche un tableau : page, niveau, secondes, blocs par type.
# L'échec d'un niveau n'arrête pas l'autre (ligne d'erreur, on continue).
#
# Le meilleur niveau mesuré (à l'œil sur les .md + au chronomètre) devient
# le défaut du serveur (--niveau). Voir LISEZMOI.md, section comparatif.

import argparse
import json
import os
import sys
import time
from datetime import date

DOSSIER = os.path.dirname(os.path.abspath(__file__))
if DOSSIER not in sys.path:
    sys.path.insert(0, DOSSIER)

import moteur_pages  # transformer_page, lire_taille_image (locaux, purs)

NIVEAUX_PAR_DEFAUT = "basic,standard"


def charger_parseur():
    """Le paquet mineru (pas ce dossier) ; message français s'il manque."""
    try:
        from mineru.parser import parse
        return parse, None
    except ImportError:
        return None, (
            "Le moteur n'est pas installé. Dans ce dossier : "
            "py -3.12 -m pip install -r requirements.txt"
        )


def blocs_depuis_contrat(page):
    """Contract /page -> liste de blocs du résultat MinerU brut."""
    return page.get("blocs", []) if isinstance(page, dict) else []


def markdown_depuis_contrat(page):
    """Contrat v2 -> Markdown lisible, à comparer à l'œil entre niveaux."""
    lignes = []
    for bloc in blocs_depuis_contrat(page):
        type_ = bloc.get("type")
        if type_ == "titre":
            lignes.append("")
            lignes.append("## " + bloc.get("texte", ""))
        elif type_ == "texte":
            for ligne in bloc.get("lignes", []):
                texte = " ".join(
                    mot.get("texte", "") for mot in ligne.get("mots", []))
                if texte.strip():
                    lignes.append(texte)
            lignes.append("")
        elif type_ == "formule":
            lignes.append("")
            lignes.append("$$" + bloc.get("latex", "") + "$$")
        elif type_ == "tableau":
            lignes.append("")
            lignes.append(bloc.get("html", ""))
        elif type_ == "image":
            lignes.append("")
            lignes.append("[image {}×{}]".format(
                bloc["bbox"][2] - bloc["bbox"][0],
                bloc["bbox"][3] - bloc["bbox"][1]))
    return "\n".join(lignes).strip() + "\n"


def decompte_par_type(page):
    """(total, {type: n}) du contrat, pour le tableau console."""
    decompte = {}
    total = 0
    for bloc in blocs_depuis_contrat(page):
        total += 1
        decompte[bloc.get("type", "?")] = decompte.get(bloc.get("type", "?"), 0) + 1
    lignes_texte = sum(
        len(bloc.get("lignes", []))
        for bloc in blocs_depuis_contrat(page)
        if bloc.get("type") == "texte")
    return total, decompte, lignes_texte


def main():
    analyse = argparse.ArgumentParser(
        description="Comparatif des niveaux de MinerU sur des pages réelles "
        "(v0.1.26) : chronomètre, Markdown à comparer à l'œil, contrats JSON.")
    analyse.add_argument("pages", nargs="+",
                         help="images de pages (PNG ou JPEG)")
    analyse.add_argument("--niveaux", default=NIVEAUX_PAR_DEFAUT,
                         help="niveaux à comparer, séparés par des virgules "
                         "(défaut : basic,standard)")
    analyse.add_argument("--sortie", default="",
                         help="dossier de sortie (défaut : comparatif-AAAA-MM-JJ)")
    options = analyse.parse_args()

    niveaux = [n.strip() for n in options.niveaux.split(",") if n.strip()]
    pages = []
    for chemin in options.pages:
        if not os.path.isfile(chemin):
            print("Page introuvable, ignorée : %s" % chemin)
            continue
        pages.append(chemin)
    if not pages:
        print("Aucune page lisible : rien à faire.")
        return 1

    parse, erreur = charger_parseur()
    if erreur:
        print(erreur)
        return 1

    sortie = options.sortie or "comparatif-%s" % date.today().isoformat()
    os.makedirs(sortie, exist_ok=True)
    print("Comparatif MinerU — %d page(s), niveau(x) : %s." % (len(pages), ", ".join(niveaux)))
    print("Sortie : %s%s" % ("" if os.path.isabs(sortie) else "./", sortie))

    # Résultats : lignes (page, niveau, secondes, blocs, décompte, remarque)
    lignes = []
    echecs = 0
    for niveau in niveaux:
        for page_chemin in pages:
            nom = os.path.splitext(os.path.basename(page_chemin))[0]
            base = os.path.join(sortie, "%s-%s" % (nom, niveau))
            try:
                with open(page_chemin, "rb") as fichier:
                    octets = fichier.read()
                largeur, hauteur = moteur_pages.lire_taille_image(octets) or (0, 0)
                print("Reconnaissance %s : %s…" % (niveau, os.path.basename(page_chemin)))
                debut = time.perf_counter()
                resultat = parse(page_chemin, tier=niveau)
                duree = time.perf_counter() - debut
                conv = moteur_pages._vers_dict(resultat)
                premiere = moteur_pages._blocs_de_source(
                    conv if conv is not None else resultat)
                contrat = moteur_pages.transformer_page(premiere, largeur, hauteur)
                total, decompte, lignes_texte = decompte_par_type(contrat)
                with open(base + ".json", "w", encoding="utf-8") as fichier:
                    json.dump(contrat, fichier, ensure_ascii=False, indent=2)
                with open(base + ".md", "w", encoding="utf-8") as fichier:
                    fichier.write(markdown_depuis_contrat(contrat))
                lignes.append((nom, niveau, duree, total,
                               " ; ".join("%d %s" % (n, t) for t, n in
                                          sorted(decompte.items()))
                               + (" (%d lignes de texte)" % lignes_texte
                                  if lignes_texte else ""), ""))
            except Exception as err:
                echecs += 1
                lignes.append((nom, niveau, 0.0, 0, "", "échec : %s" % err))

    # Tableau console.
    print()
    print("%-18s %-9s %8s %6s  %s" % ("page", "niveau", "secondes", "blocs", "contenu"))
    for nom, niveau, duree, total, contenu, remarque in lignes:
        if remarque:
            print("%-18s %-9s %8s %6s  %s" % (nom, niveau, "—", "—", remarque))
        else:
            print("%-18s %-9s %8.1f %6d  %s" % (
                nom, niveau, duree, total,
                contenu or "aucun bloc exploitable"))
    print()
    print("Comparer maintenant les fichiers .md à l'œil, niveau par niveau ;")
    print("le meilleur (qualité ET temps) devient le défaut du serveur (--niveau).")
    if echecs:
        print("%d échec(s) sur %d essai(s)." % (echecs, len(lignes)))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
