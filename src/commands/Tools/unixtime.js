import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { getColor } from '../../config/bot.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('unixtime')
        .setDescription('קבלת חותם הזמן הנוכחי של יוניקס (Unix timestamp)'),

    async execute(interaction) {
        await InteractionHelper.safeExecute(
            interaction,
            async () => {
                const now = new Date();
                const unixTimestamp = Math.floor(now.getTime() / 1000);

                const embed = successEmbed(
                    '⏱️ חותם זמן יוניקס נוכחי',
                    `**שניות מאז תקופת יוניקס:** \`${unixTimestamp}\`\n` +
                    `**מילישניות מאז תקופת יוניקס:** \`${now.getTime()}\`\n\n` +
                    `**זמן קריא לבני אדם (UTC):** ${now.toUTCString()}\n` +
                    `**מחרוזת ISO:** ${now.toISOString()}`
                );
                embed.setColor(getColor('success'));

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [embed],
                });
            },
            'שגיאה בהבאת חותם הזמן של יוניקס. אנא נסו שוב.',
            {
                autoDefer: true,
                deferOptions: { flags: MessageFlags.Ephemeral }
            }
        );
    },
};
