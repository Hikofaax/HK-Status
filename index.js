// index.js

const { 
    Client, 
    GatewayIntentBits, 
    REST, 
    Routes, 
    SlashCommandBuilder, 
    EmbedBuilder 
} = require('discord.js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

// ==========================
// Configuration & Constantes
// ==========================

// Chargement des informations sensibles et d'identification depuis config.json
const { token, clientId, guildId, channelId, authorizedRoleId } = require('./config.json');

// URL de l'endpoint qui retourne la liste des joueurs connectés au serveur FiveM
const PLAYER_ENDPOINT = ''; // URL du serveur FiveM avec /players.json

// Constantes pour l'affichage des embeds
const COLOR_CODE = ''; // Couleur principale des embeds
const SERVER_TITLE = ''; // Nom du serveur affiché dans les embeds
const SERVER_IP = ''; // L'IP est dynamique et peut être modifiée ici (ip server)
const IMG_ONLINE = '';
const IMG_OFFLINE = '';
const IMG_MAINTENANCE = '';

// Paramètres de cryptage pour le fichier de licence (nécessaires pour protéger le crédit)
// La clé et l'IV doivent rester cohérents avec ceux utilisés lors du chiffrement du fichier license.enc
const ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef'; // Clé de 32 bytes pour AES-256  // ne pas modifier // sinon le bot ne fonctionnera pas //
const IV = Buffer.from('abcdef9876543210'); // IV de 16 bytes pour AES-256-CBC  // ne pas modifier // sinon le bot ne fonctionnera pas //

// =====================================
// Fonctions de cryptage/décryptage & Licence
// =====================================

/**
 * Décrypte un texte encodé en base64 en utilisant AES-256-CBC.
 * @param {string} text - Le texte crypté (en base64)
 * @returns {string} Le texte décrypté en UTF-8
 */
function decrypt(text) {
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), IV);
    let decrypted = decipher.update(text, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

/**
 * Charge et déchiffre le fichier de licence (license.enc).
 * Si le fichier est absent ou si une erreur survient lors du décryptage,
 * le bot s'arrête pour garantir que le crédit "Hikofaa" est bien affiché.
 * @returns {string} Le contenu décrypté (ASCII art + crédit Hikofaa)
 */
function loadLicense() {
    const licensePath = path.join(__dirname, 'license.enc');
    if (!fs.existsSync(licensePath)) {
        console.error("Le fichier 'license.enc' est manquant. Le bot ne peut pas démarrer sans ce fichier.");
        process.exit(1);
    }
    const encryptedContent = fs.readFileSync(licensePath, { encoding: 'utf8' });
    try {
        const decryptedContent = decrypt(encryptedContent);
        return decryptedContent;
    } catch (err) {
        console.error("Erreur lors de la décryption du fichier 'license.enc'. Le bot ne peut pas démarrer.");
        process.exit(1);
    }
}

// ============================
// Initialisation du client Discord
// ============================

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Variables globales pour la gestion de l'embed dynamique
let embedMessage = null;    // Contiendra le message Discord contenant l'embed
let pollingInterval = null; // Référence à l'intervalle de polling pour les mises à jour
let lastPlayerData = null;  // Sauvegarde des données de players.json pour détecter les changements
let lastStatus = null;      // Stocke l'état actuel : 'online', 'offline' ou 'maintenance'

// =====================================
// Fonctions de création des embeds
// =====================================

/**
 * Crée un embed pour le statut "en ligne".
 * Ce embed affiche la mention @everyone dans la description afin de notifier tout le monde.
 * @param {Array} playerData - Tableau des joueurs connectés
 * @returns {EmbedBuilder} L'embed construit pour un serveur en ligne
 */
function createOnlineEmbed(playerData) {
    const playerCount = Array.isArray(playerData) ? playerData.length : 0;
    return new EmbedBuilder()
        .setColor(COLOR_CODE)
        .setTitle(`✅ ${SERVER_TITLE} - Serveur en ligne`)
        .setDescription(
            `@everyone\n**Le serveur est actuellement en ligne !**\n\n` +
            `> **Joueurs connectés :** \`${playerCount} / 64\`\n` +
            `> **Adresse IP :** \`${SERVER_IP}\`\n\n` +
            `Profitez pleinement de votre expérience de jeu sur **${SERVER_TITLE}** !`
        )
        .setImage(IMG_ONLINE)
        .setFooter({ text: 'Statut : En ligne • Mise à jour' })
        .setTimestamp();
}

/**
 * Crée un embed pour le statut "hors ligne".
 * La mention @everyone est incluse pour notifier l'ensemble des membres.
 * @returns {EmbedBuilder} L'embed pour un serveur hors ligne
 */
function createOfflineEmbed() {
    return new EmbedBuilder()
        .setColor(COLOR_CODE)
        .setTitle(`❌ ${SERVER_TITLE} - Serveur hors ligne`)
        .setDescription(
            `@everyone\n**Le serveur est actuellement hors ligne.**\n\n` +
            `> **Adresse IP :** \`${SERVER_IP}\`\n\n` +
            `Nous travaillons à résoudre ce problème le plus rapidement possible. ` +
            `Restez à l’affût pour plus d’informations !`
        )
        .setImage(IMG_OFFLINE)
        .setFooter({ text: 'Statut : Hors ligne • Mise à jour' })
        .setTimestamp();
}

/**
 * Crée un embed pour le mode "maintenance".
 * Ce mode indique que le serveur est en cours de maintenance et inclut la mention @everyone.
 * @returns {EmbedBuilder} L'embed pour la maintenance
 */
function createMaintenanceEmbed() {
    return new EmbedBuilder()
        .setColor(COLOR_CODE)
        .setTitle(`🔧 ${SERVER_TITLE} - Maintenance en cours`)
        .setDescription(
            `@everyone\n**Le serveur est actuellement en maintenance.**\n\n` +
            `> **Adresse IP :** \`${SERVER_IP}\`\n\n` +
            `Veuillez patienter pendant que nous améliorons le serveur. ` +
            `Le jeu sera de nouveau accessible dès que possible.`
        )
        .setImage(IMG_MAINTENANCE)
        .setFooter({ text: 'Statut : Maintenance • Mise à jour' })
        .setTimestamp();
}

// ========================================
// Sauvegarde et chargement de l'état de l'embed
// ========================================

/**
 * Enregistre l'état actuel de l'embed dans le fichier logs/status.json.
 * Cela inclut l'ID du message embed, le statut, le nombre de joueurs et l'heure de la dernière mise à jour.
 * @param {Object} statusObj - Objet contenant les informations à sauvegarder.
 */
async function logStatus(statusObj) {
    const logsDir = path.join(__dirname, 'logs');
    if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir);
    }
    const logPath = path.join(logsDir, 'status.json');
    try {
        await fs.promises.writeFile(logPath, JSON.stringify(statusObj, null, 2));
    } catch (err) {
        console.error("Erreur lors de l'écriture du log :", err);
    }
}

/**
 * Tente de charger l'embed sauvegardé à partir du fichier logs/status.json.
 * Si un messageId est trouvé, le bot récupère ce message et reprend l'état.
 */
async function loadSavedEmbed() {
    const statusPath = path.join(__dirname, 'logs/status.json');
    if (fs.existsSync(statusPath)) {
        try {
            const data = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
            if (data.messageId) {
                const channel = await client.channels.fetch(channelId);
                try {
                    embedMessage = await channel.messages.fetch(data.messageId);
                    // Reprise de l'état sauvegardé
                    lastStatus = data.status || null;
                    // On sauvegarde uniquement la longueur (nombre de joueurs) pour comparaison
                    lastPlayerData = data.playerCount ? { length: data.playerCount } : null;
                    console.log("Embed sauvegardé chargé avec succès !");
                } catch (err) {
                    console.error("Impossible de charger l'embed sauvegardé :", err);
                }
            }
        } catch (err) {
            console.error("Erreur lors du chargement du fichier status.json :", err);
        }
    }
}

// ===============================
// Récupération des données du serveur
// ===============================

/**
 * Effectue une requête vers l'endpoint du serveur FiveM pour récupérer les données des joueurs.
 * En cas d'erreur (ex : serveur injoignable), retourne null.
 * @returns {Promise<Array|null>} Le tableau de joueurs ou null en cas d'erreur.
 */
async function fetchPlayerData() {
    try {
        const response = await axios.get(PLAYER_ENDPOINT, {
            httpsAgent: new https.Agent({ rejectUnauthorized: false })
        });
        return response.data;
    } catch (err) {
        return null;
    }
}

// ===============================
// Enregistrement des commandes slash
// ===============================

const commands = [
    new SlashCommandBuilder()
        .setName('set-status')
        .setDescription('Affiche et met à jour l\'embed dynamique selon players.json'),
    new SlashCommandBuilder()
        .setName('set-status-maintenance')
        .setDescription('Passe l\'embed en mode maintenance')
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
    try {
        console.log('Enregistrement des commandes slash...');
        await rest.put(
            Routes.applicationGuildCommands(clientId, guildId),
            { body: commands }
        );
        console.log('Commandes enregistrées.');
    } catch (error) {
        console.error(error);
    }
})();

// =======================================
// Événement "ready" : démarrage du bot
// =======================================

client.once('ready', async () => {
    // Chargement et affichage du fichier de licence crypté
    const licenseText = loadLicense();
    console.log(licenseText);
    
    // Tente de charger l'embed sauvegardé afin de reprendre l'état précédent
    await loadSavedEmbed();
    
    console.log(`Connecté en tant que ${client.user.tag}`);
});

// =======================================
// Polling dynamique pour la mise à jour de l'embed
// =======================================

/**
 * Démarre un intervalle qui vérifie l'état du serveur toutes les 15 secondes.
 * Si un changement d'état ou de nombre de joueurs est détecté, l'embed est mis à jour
 * et les informations sont sauvegardées dans logs/status.json.
 * @param {TextChannel} channel - Le canal Discord où l'embed est envoyé.
 */
function startPolling(channel) {
    if (pollingInterval) return; // Eviter de démarrer plusieurs intervalles simultanément

    pollingInterval = setInterval(async () => {
        const newData = await fetchPlayerData();
        const newStatus = newData === null ? 'offline' : 'online';

        // Vérification d'un changement d'état (ex : de en ligne à hors ligne)
        if (newStatus !== lastStatus) {
            if (newStatus === 'offline') {
                const offlineEmbed = createOfflineEmbed();
                try {
                    // Récupération et mise à jour de l'embed existant
                    embedMessage = await channel.messages.fetch(embedMessage.id);
                    await embedMessage.edit({ 
                        embeds: [offlineEmbed],
                        allowedMentions: { parse: ['everyone'] }
                    });
                    await logStatus({
                        messageId: embedMessage.id,
                        status: 'Hors ligne',
                        playerCount: 0,
                        lastUpdate: new Date().toISOString()
                    });
                    lastStatus = 'offline';
                } catch (err) { }
            } else if (newStatus === 'online') {
                const onlineEmbed = createOnlineEmbed(newData);
                try {
                    embedMessage = await channel.messages.fetch(embedMessage.id);
                    await embedMessage.edit({ 
                        embeds: [onlineEmbed],
                        allowedMentions: { parse: ['everyone'] }
                    });
                    await logStatus({
                        messageId: embedMessage.id,
                        status: 'En ligne',
                        playerCount: Array.isArray(newData) ? newData.length : 0,
                        lastUpdate: new Date().toISOString()
                    });
                    lastStatus = 'online';
                    lastPlayerData = newData;
                } catch (err) {
                    console.error("Erreur lors de la mise à jour (online) :", err);
                }
            }
        }

        // Si le serveur est en ligne, vérifier si le nombre de joueurs a changé
        if (newStatus === 'online' && Array.isArray(newData)) {
            const newCount = newData.length;
            const oldCount = Array.isArray(lastPlayerData) ? lastPlayerData.length : 0;
            if (newCount !== oldCount) {
                const onlineEmbed = createOnlineEmbed(newData);
                try {
                    embedMessage = await channel.messages.fetch(embedMessage.id);
                    await embedMessage.edit({ 
                        embeds: [onlineEmbed],
                        allowedMentions: { parse: ['everyone'] }
                    });
                    await logStatus({
                        messageId: embedMessage.id,
                        status: 'En ligne',
                        playerCount: newCount,
                        lastUpdate: new Date().toISOString()
                    });
                    lastPlayerData = newData;
                } catch (err) {
                    console.error("Erreur lors de la mise à jour (changement de joueurs) :", err);
                }
            }
        }
    }, 15000);
}

// ========================================
// Gestion des commandes slash
// ========================================

/**
 * Les commandes slash "set-status" et "set-status-maintenance" sont restreintes aux membres possédant un rôle autorisé.
 * Elles permettent de mettre à jour l'embed affiché dans le canal défini.
 */
client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    // Vérification de la présence du rôle autorisé pour exécuter la commande
    if (!interaction.member.roles.cache.has(authorizedRoleId)) {
        return interaction.reply({ 
            content: "Vous n'avez pas la permission d'utiliser cette commande.", 
            ephemeral: true 
        });
    }

    // Récupération du canal cible depuis l'ID configuré
    const channel = await client.channels.fetch(channelId);
    if (!channel) {
        return interaction.reply({ content: 'Canal non trouvé.', ephemeral: true });
    }

    // Traitement de la commande "set-status"
    if (interaction.commandName === 'set-status') {
        const playerData = await fetchPlayerData();
        let embed;

        // Définition de l'embed en fonction de la disponibilité des données
        if (playerData === null) {
            embed = createOfflineEmbed();
            lastStatus = 'offline';
        } else {
            embed = createOnlineEmbed(playerData);
            lastStatus = 'online';
            lastPlayerData = playerData;
        }

        try {
            // Si un embed existe déjà, on le met à jour ; sinon, on envoie un nouveau message
            if (embedMessage) {
                embedMessage = await channel.messages.fetch(embedMessage.id);
                await embedMessage.edit({ 
                    embeds: [embed],
                    allowedMentions: { parse: ['everyone'] }
                });
            } else {
                embedMessage = await channel.send({ 
                    embeds: [embed],
                    allowedMentions: { parse: ['everyone'] }
                });
            }
            // Enregistrement de l'état dans le fichier de log pour reprendre la progression
            await logStatus({
                messageId: embedMessage.id,
                status: playerData === null ? 'Hors ligne' : 'En ligne',
                playerCount: playerData === null ? 0 : (Array.isArray(playerData) ? playerData.length : 0),
                lastUpdate: new Date().toISOString()
            });
            // Démarrage du polling pour les mises à jour dynamiques
            startPolling(channel);
            await interaction.reply({ content: 'Embed dynamique mis à jour.', ephemeral: true });
        } catch (err) {
            console.error(err);
            return interaction.reply({ content: 'Erreur lors de la mise à jour de l\'embed.', ephemeral: true });
        }
    } 
    // Traitement de la commande "set-status-maintenance"
    else if (interaction.commandName === 'set-status-maintenance') {
        // Arrêt du polling dynamique pour passer en mode maintenance
        if (pollingInterval) {
            clearInterval(pollingInterval);
            pollingInterval = null;
        }
        const maintenanceEmbed = createMaintenanceEmbed();
        try {
            if (embedMessage) {
                embedMessage = await channel.messages.fetch(embedMessage.id);
                await embedMessage.edit({ 
                    embeds: [maintenanceEmbed],
                    allowedMentions: { parse: ['everyone'] }
                });
            } else {
                embedMessage = await channel.send({ 
                    embeds: [maintenanceEmbed],
                    allowedMentions: { parse: ['everyone'] }
                });
            }
            await logStatus({
                messageId: embedMessage.id,
                status: 'Maintenance',
                playerCount: 0,
                lastUpdate: new Date().toISOString()
            });
            lastStatus = 'maintenance';
            await interaction.reply({ content: 'Embed mis à jour en mode maintenance.', ephemeral: true });
        } catch (err) {
            console.error(err);
            return interaction.reply({ content: 'Erreur lors de la mise à jour de l\'embed.', ephemeral: true });
        }
    }
});

// ===========================
// Connexion du bot
// ===========================
client.login(token);
