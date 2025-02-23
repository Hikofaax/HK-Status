# HK-Status BOT

Un bot Discord élégant et puissant conçu pour afficher en temps réel le statut de votre serveur FiveM.  
Grâce à un embed dynamique, il vous permet de suivre le nombre de joueurs connectés et l'état du serveur (en ligne, hors ligne ou en maintenance).  
Ce projet intègre également un système de licence pour afficher un ASCII art avec le crédit "Hikofaa".

---

## Table des matières

- [Aperçu](#aperçu)
- [Fonctionnalités](#fonctionnalités)
- [Pré-requis](#pré-requis)
- [Installation](#installation)

---

## Aperçu

Le **HK-status BOT** est conçu pour offrir une interface visuelle moderne et interactive sur Discord.  
Il interroge régulièrement l'API de votre serveur FiveM et met à jour un embed dans un canal spécifique pour refléter le statut actuel du serveur.  
Si le bot redémarre, il reprend là où il s'était arrêté grâce à la sauvegarde de l'ID du message embed dans un fichier JSON.

---

## Fonctionnalités

- **Embed Dynamique :**  
  Mise à jour en temps réel du statut du serveur (en ligne, hors ligne, maintenance) avec des images et des couleurs personnalisables.
  
- **Sauvegarde de l'État :**  
  Reprise automatique du message embed grâce à la sauvegarde de son ID et des informations dans `logs/status.json`.
  
- **Commandes Slash :**  
  Deux commandes principales, accessibles uniquement aux membres autorisés, pour mettre à jour l'état du serveur :
  - `/set-status`
  - `/set-status-maintenance`
  
- **Système de Licence :**  
  Le bot charge un fichier de licence crypté (`license.enc`) qui affiche un ASCII art et le crédit "Hikofaa" au démarrage.
  
- **Polling Automatique :**  
  Le bot interroge l'API toutes les 15 secondes pour détecter les changements et mettre à jour l'embed en conséquence.

---

## Pré-requis

- **Node.js** version 21 ou supérieure.
- **npm** pour la gestion des dépendances.
- Un **bot Discord** configuré avec un token, client ID, guild ID et channel ID.
- Un serveur FiveM accessible via un endpoint (ex. : `https://localhost:30120/players.json`).

---

## Installation

1. **Cloner le dépôt :**

   ```bash
   git clone https://github.com/Hikofaax/HK-Status.git
   cd HK-Status
   npm i 
   node .
