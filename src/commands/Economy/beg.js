import { SlashCommandBuilder } from 'discord.js';
import { successEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { botConfig } from '../../config/bot.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const COOLDOWN = 30 * 60 * 1000;
const MIN_WIN = 50;
const MAX_WIN = 200;
const SUCCESS_CHANCE = 0.7;

export default {
    data: new SlashCommandBuilder()
        .setName('beg')
        .setDescription('בקשת נדבות בשביל לקבל סכום כסף קטן'),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;
            
            const userId = interaction.user.id;
            const guildId = interaction.guildId;

            let userData = await getEconomyData(client, guildId, userId);
            
            if (!userData) {
                throw createError(
                    "Failed to load economy data",
                    ErrorTypes.DATABASE,
                    "טעינת נתוני הכלכלה שלך נכשלה. אנא נסה שוב מאוחר יותר.",
                    { userId, guildId }
                );
            }

            const lastBeg = userData.lastBeg || 0;
            const remainingTime = lastBeg + COOLDOWN - Date.now();

            if (remainingTime > 0) {
                const minutes = Math.floor(remainingTime / 60000);
                const seconds = Math.floor((remainingTime % 60000) / 1000);

                let timeMessage =
                    minutes > 0 ? `${minutes} דקות` : `${seconds} שניות`;

                throw createError(
                    "Beg cooldown active",
                    ErrorTypes.RATE_LIMIT,
                    `אתה עייף מדי מלבקש נדבות! תוכל לנסות שוב בעוד **${timeMessage}**.`,
                    { remainingTime, minutes, seconds, cooldownType: 'beg' }
                );
            }

            const success = Math.random() < SUCCESS_CHANCE;

            let replyEmbed;
            let newCash = userData.wallet;

            if (success) {
                const amountWon =
                    Math.floor(Math.random() * (MAX_WIN - MIN_WIN + 1)) + MIN_WIN;

                newCash += amountWon;

                const successMessages = [
                    `זר טוב לב זרק **$${amountWon.toLocaleString()}** לתוך הכוס שלך.`,
                    `שמת לב לארנק שהושאר ללא השגחה! חטפת **$${amountWon.toLocaleString()}** וברחת.`,
                    `מישהו ריחם עליך ונתן לך **$${amountWon.toLocaleString()}**!`,
                    `מצאת **$${amountWon.toLocaleString()}** זרוקים מתחת לספסל בגן הציבורי.`,
                ];

                replyEmbed = successEmbed(
                    'הקיבוץ הצליח! 💰',
                    successMessages[
                        Math.floor(Math.random() * successMessages.length)
                    ]
                );
            } else {
                const failMessages = [
                    "המשטרה גירשה אותך מהמקום. לא קיבלת כלום.",
                    "מישהו צעק לעברך 'לך תמצא עבודה!' והמשיך ללכת.",
                    "סנאי חצוף גנב לך את המטבע היחיד שהיה לך.",
                    "ניסית לבקש נדבות, אבל התביישת מדי וויתרת על זה.",
                ];

                replyEmbed = warningEmbed(
                    'הקיבוץ נכשל ❌',
                    failMessages[Math.floor(Math.random() * failMessages.length)]
                );
            }

            userData.wallet = newCash;
            userData.lastBeg = Date.now();

            await setEconomyData(client, guildId, userId, userData);

            await InteractionHelper.safeEditReply(interaction, { embeds: [replyEmbed] });
    }, { command: 'beg' })
};
