import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("avatar")
        .setDescription("הצגת תמונת הפרופיל (אווטאר) של משתמש")
        .addUserOption((option) =>
            option
                .setName("יעד")
                .setDescription(
                    "המשתמש שאת תמונת הפרופיל שלו תרצו לראות (ברירת המחדל היא אתם)",
                ),
        ),

    async execute(interaction) {
        try {
            const user = interaction.options.getUser("יעד") || interaction.user;
            const avatarUrl = user.displayAvatarURL({ size: 2048, dynamic: true });

            const embed = createEmbed({ 
                title: `תמונת הפרופיל של ${user.username}`, 
                description: `[קישור להורדה](${avatarUrl})` 
            })
            .setImage(avatarUrl);

            await InteractionHelper.safeReply(interaction, { embeds: [embed] });
            logger.info(`Avatar command executed`, {
                userId: interaction.user.id,
                targetUserId: user.id,
                guildId: interaction.guildId
            });
        } catch (error) {
            logger.error(`Avatar command execution failed`, {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'avatar'
            });
            await handleInteractionError(interaction, error, {
                commandName: 'avatar',
                source: 'avatar_command'
            });
        }
    }
};
