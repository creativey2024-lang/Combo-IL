import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { infoEmbed, successEmbed } from '../../utils/embeds.js';
import { withErrorHandling } from '../../utils/errorHandler.js';
import { verifyUser } from '../../services/verificationService.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('verify')
        .setDescription('אימות עצמי וקבלת גישה לערוצי השרת'),

    async execute(interaction, config, client) {
        const wrappedExecute = withErrorHandling(async () => {
            const guild = interaction.guild;

            const result = await verifyUser(client, guild.id, interaction.user.id, {
                source: 'command_self',
                moderatorId: null
            });

            if (!result.success) {
                if (result.alreadyVerified) {
                    return await InteractionHelper.safeReply(interaction, {
                        embeds: [infoEmbed('כבר מאומת', "אתה כבר מאומת בשרת זה.")],
                        flags: MessageFlags.Ephemeral
                    });
                }

                return await replyUserError(interaction, { 
                    type: ErrorTypes.UNKNOWN, 
                    message: 'התרחשה שגיאה במהלך תהליך האימות. אנא נסו שוב או פנו להנהלת השרת.' 
                });
            }

            await InteractionHelper.safeReply(interaction, {
                embeds: [successEmbed(
                    "האימות הושלם בהצלחה",
                    `אומתת בהצלחה וקיבלת את התפקיד **${result.roleName}**! ברוך הבא לשרת! 🎉`
                )],
                flags: MessageFlags.Ephemeral
            });
        }, { command: 'verify' });

        return await wrappedExecute(interaction, config, client);
    }
};
