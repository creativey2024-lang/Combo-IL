import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, warningEmbed } from '../../utils/embeds.js';
import { getConfirmationButtons } from '../../utils/components.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName('wipedata')
        .setDescription('מחיקת כל המידע האישי שלך מהבוט (פעולה בלתי הפיכה)'),

    async execute(interaction, guildConfig, client) {
        try {
            const warningMessage = 
                `⚠️ **פעולה זו היא בלתי הפיכה!** ⚠️\n\n` +
                `פעולה זו תמחק לצמיתות את **כל** הנתונים שלך משרת זה, כולל:\n` +
                `• 💰 מאזן כלכלה (ארנק ובנק)\n` +
                `• 📊 רמות ונקודות ניסיון (XP)\n` +
                `• 🎒 חפצים באינוונטורי (Inventory)\n` +
                `• 🛍️ רכישות מהחנות\n` +
                `• 🎂 מידע על ימי הולדת\n` +
                `• 🔢 נתוני מונים (Counters)\n` +
                `• 📋 כל מידע אישי אחר\n\n` +
                `**לא ניתן לבטל פעולה זו לאחר ביצועה. האם אתם בטוחים לחלוטין?**`;

            const embed = warningEmbed('מחיקת כל המידע', warningMessage);

            const confirmButtons = getConfirmationButtons('wipedata');

            await InteractionHelper.safeReply(interaction, {
                embeds: [embed],
                components: [confirmButtons],
                flags: MessageFlags.Ephemeral
            });

            logger.info(`Wipedata command executed - confirmation prompt shown`, {
                userId: interaction.user.id,
                guildId: interaction.guildId
            });
        } catch (error) {
            logger.error(`Wipedata command execution failed`, {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'wipedata'
            });
            await handleInteractionError(interaction, error, {
                commandName: 'wipedata',
                source: 'wipedata_command'
            });
        }
    }
};
