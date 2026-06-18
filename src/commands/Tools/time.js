import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('time')
        .setDescription('הצגת הזמן הנוכחי באזורי זמן שונים')
        .addStringOption(option =>
            option.setName('timezone')
                .setDescription('אזור הזמן להצגה (לדוגמה: UTC, Asia/Jerusalem, America/New_York)')
                .setRequired(false)),

    async execute(interaction) {
        await InteractionHelper.safeExecute(
            interaction,
            async () => {
                const timezone = interaction.options.getString('timezone') || 'Asia/Jerusalem';

                let timeString;
                try {
                    timeString = new Date().toLocaleString('he-IL', {
                        timeZone: timezone,
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        timeZoneName: 'short'
                    });
                } catch (error) {
                    logger.warn(`Invalid timezone requested: ${timezone}`);
                    await replyUserError(interaction, {
                        type: ErrorTypes.VALIDATION,
                        message: 'אזור זמן לא תקין. אנא השתמשו במזהה אזור זמן תקף (לדוגמה: Asia/Jerusalem, UTC, America/New_York)',
                    });
                    return;
                }

                const now = new Date();
                const unixTimestamp = Math.floor(now.getTime() / 1000);

                const embed = successEmbed(
                    '🕒 זמן נוכחי',
                    `**אזור זמן (${timezone}):** ${timeString}\n` +
                    `**Unix Timestamp:** \`${unixTimestamp}\`\n` +
                    `**ISO String:** \`${now.toISOString()}\``
                );

                embed.setFooter({ text: 'Combo IL • אמטיקינג יצר את זה' });

                await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            },
            'שגיאה בהבאת הזמן הנוכחי. אנא נסו שוב.',
            {
                autoDefer: true,
                deferOptions: { flags: MessageFlags.Ephemeral }
            }
        );
    },
};
