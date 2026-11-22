@echo off
rem serveur-ocr/demarrage-windows.cmd — v0.1.25
rem Lance le serveur OCR LaTeX dans une fenetre reduite, sans ouvrir
rem de terminal a la main. A relancer apres chaque redemarrage du PC
rem (le serveur ne s'ouvre pas tout seul). Si le Python 3.12 n'est pas
rem celui par defaut, "py -3.12" vise expres la bonne version.
cd /d "%~dp0"
start "Serveur OCR Atelier PDF" /min py -3.12 serveur.py
