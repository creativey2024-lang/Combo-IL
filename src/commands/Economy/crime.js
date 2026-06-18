import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const CRIME_COOLDOWN = 60 * 60 * 1000;
const MIN_CRIME_AMOUNT = 100;
const MAX_CRIME_AMOUNT = 2000;
const FAILURE_RATE = 0.4;
const JAIL_TIME = 2 * 60 * 60 * 1000;

const CRIME_TYPES = [
    { name: "כיוס (Pickpocketing)", min: 100, max: 500, risk: 0.3, id: 'pickpocketing' },
    { name: "פריצה (Burglary)", min: 300, max: 1000, risk: 0.4, id: 'burglary' },
    { name: "שוד בנק (Bank Heist)", min: 1000, max: 5000, risk: 0.6, id: 'bank-heist' },
    { name: "גניבת אמנות (Art Theft)", min: 2000, max: 10000, risk: 0.7, id: 'art-theft' },
    { name: "פשע סייבר (Cybercrime)", min: 5000, max: 20000, risk: 0.8, id: 'cybercrime' },
];

export default {
    data: new SlashCommandBuilder()
        .setName('crime')
        .setDescription('ביצוע פשע כדי להרוויח כסף (מסוכן)')
        .addStringOption(option =>
            option
                .setName('type')
                .setDescription('סוג הפשע שברצונך לבצע')
                .setRequired(true)
                .addChoices(
                    { name: 'כיוס 🎒', value: 'pickpocketing' },
                    { name: 'פריצה לבית 🏠', value: 'burglary' },
                    { name: 'שוד בנק 🏦', value: 'bank-heist' },
                    { name: 'גניבת יצירת אמנות 🖼️', value: 'art-theft' },
                    { name: 'פשע סייבר 💻', value: 'cybercrime' },
                )
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        await InteractionHelper.safeDefer(interaction);
            
            const userId = interaction.user.id;
            const guildId = interaction.guildId;
            const now = Date.now();

            const userData = await getEconomyData(client, guildId, userId);
            const lastCrime = userData.cooldowns?.crime || 0;
            const isJailed = userData.jailedUntil && userData.jailedUntil > now;

            if (isJailed) {
                const timeLeft = Math.ceil((userData.jailedUntil - now) / (1000 * 60));
                throw createError(
                    "User is in jail",
                    ErrorTypes.RATE_LIMIT,
                    `אתה נמצא בכלא לעוד ${timeLeft} דקות!`,
                    { jailTimeRemaining: userData.jailedUntil - now }
                );
            }

            if (now < lastCrime + CRIME_COOLDOWN) {
                const timeLeft = Math.ceil((lastCrime + CRIME_COOLDOWN - now) / (1000 * 60));
                throw createError(
                    "Crime cooldown active",
                    ErrorTypes.RATE_LIMIT,
                    `עליך להמתין עוד ${timeLeft} דקות לפני שתוכל לבצע פשע נוסף.`,
                    { remaining: lastCrime + CRIME_COOLDOWN - now, cooldownType: 'crime' }
                );
            }

            const crimeType = interaction.options.getString("type").toLowerCase();
            const crime = CRIME_TYPES.find(c => c.id === crimeType);

            if (!crime) {
                throw createError(
                    "Invalid crime type",
                    ErrorTypes.VALIDATION,
                    "אנא בחר סוג פשע תקין מהרשימה.",
                    { crimeType }
                );
            }

            const isSuccess = Math.random() > crime.risk;
            
            // בחישוב הקנס במקרה של כישלון, אנו מגניבים פוטנציאל רווח היפותטי כדי לגזור ממנו את ה-20% קנס
            const potentialEarned = Math.floor(Math.random() * (crime.max - crime.min + 1)) + crime.min;
            const amountEarned = isSuccess ? potentialEarned : 0;

            userData.cooldowns = userData.cooldowns || {};
            userData.cooldowns.crime = now;

            if (isSuccess) {
                userData.wallet = (userData.wallet || 0) + amountEarned;
                
                await setEconomyData(client, guildId, userId, userData);
                
                const embed = successEmbed(
                    "🕵️ הפשע הצליח!",
                    `ביצעת בהצלחה את הפשע **${crime.name.split(' (')[0]}** והרווחת **$${amountEarned.toLocaleString()}** מטבעות!`
                );
                
                await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            } else {
                const fine = Math.floor(potentialEarned * 0.2);
                userData.wallet = Math.max(0, (userData.wallet || 0) - fine);
                userData.jailedUntil = now + JAIL_TIME;
                
                await setEconomyData(client, guildId, userId, userData);
                
                const embed = warningEmbed(
                    "🚔 נתפסת על חם!",
                    `נתפסת בזמן שניסית לבצע **${crime.name.split(' (')[0]}** ונשלחת ישירות לכלא!\n` +
                    `נקנסת בסך של **$${fine.toLocaleString()}** מטבעות ותישאר מאחורי הסורגים למשך שעתיים.`
                );
                
                await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            }
    }, { command: 'crime' })
};
