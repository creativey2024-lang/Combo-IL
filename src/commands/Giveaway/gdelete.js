import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes, handleInteractionError } from '../../utils/errorHandler.js';
import { getGuildGiveaways, deleteGiveaway } from '../../utils/giveaways.js';
import { logEvent, EVENT_TYPES } from '../../services/loggingService.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
        .setName("gdelete")
        .setDescription(
            "מחיקת הודעת הגרלה והסרתה לחלוטין ממסד הנתונים.",
        )
        .addStringOption((option) =>
            option
                .setName("messageid")
                .setDescription("מזהה ההודעה (Message ID) של ההגרלה שברצונכם למחוק.")
                .setRequired(true),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        try {
            
            if (!interaction.inGuild()) {
                throw new TitanBotError(
                    'Giveaway command used outside guild',
                    ErrorTypes.VALIDATION,
                    'ניתן להשתמש בפקודה זו בתוך שרתים בלבד.',
                    { userId: interaction.user.id }
                );
            }

            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                throw new TitanBotError(
                    'User lacks ManageGuild permission',
                    ErrorTypes.PERMISSION,
                    "אתה זקוק להרשאת 'ניהול שרת' כדי למחוק הגרלה.",
                    { userId: interaction.user.id, guildId: interaction.guildId }
                );
            }

            logger.info(`Giveaway deletion started by ${interaction.user.tag} in guild ${interaction.guildId}`);

            const messageId = interaction.options.getString("messageid");

            if (!messageId || !/^\d+$/.test(messageId)) {
                throw new TitanBotError(
                    'Invalid message ID format',
                    ErrorTypes.VALIDATION,
                    'אנא ספק מזהה הודעה (Message ID) תקין.',
                    { providedId: messageId }
                );
            }

            const giveaways = await getGuildGiveaways(interaction.client, interaction.guildId);
            const giveaway = giveaways.find(g => g.messageId === messageId);

            if (!giveaway) {
                throw new TitanBotError(
                    `Giveaway not found: ${messageId}`,
                    ErrorTypes.VALIDATION,
                    "לא נמצאה הגרלה במסד הנתונים התואמת למזהה ההודעה שסופק.",
                    { messageId, guildId: interaction.guildId }
                );
            }

            let deletedMessage = false;
            let channelName = "ערוץ לא ידוע";

            const tryDeleteFromChannel = async (channel) => {
                if (!channel || !channel.isTextBased() || !channel.messages?.fetch) {
                    return false;
                }

                const message = await channel.messages.fetch(messageId).catch(() => null);
                if (!message) {
                    return false;
                }

                await message.delete();
                channelName = channel.name || 'unknown-channel';
                deletedMessage = true;
                return true;
            };

            try {
                const channel = await interaction.client.channels.fetch(giveaway.channelId).catch(() => null);
                if (await tryDeleteFromChannel(channel)) {
                    logger.debug(`Deleted giveaway message ${messageId} from channel ${channelName}`);
                }

                if (!deletedMessage && interaction.guild) {
                    const textChannels = interaction.guild.channels.cache.filter(
                        ch => ch.id !== giveaway.channelId && ch.isTextBased() && ch.messages?.fetch
                    );

                    for (const [, guildChannel] of textChannels) {
                        const foundAndDeleted = await tryDeleteFromChannel(guildChannel).catch(() => false);
                        if (foundAndDeleted) {
                            logger.debug(`Deleted giveaway message ${messageId} via fallback lookup in #${channelName}`);
                            break;
                        }
                    }
                }
            } catch (error) {
                logger.warn(`Could not delete giveaway message: ${error.message}`);
            }

            const removedFromDatabase = await deleteGiveaway(
                interaction.client,
                interaction.guildId,
                messageId,
            );

            if (!removedFromDatabase) {
                throw new TitanBotError(
                    `Failed to delete giveaway from database: ${messageId}`,
                    ErrorTypes.UNKNOWN,
                    'לא ניתן היה להסיר את ההגרלה ממסד הנתונים. אנא נסה שנית.',
                    { messageId, guildId: interaction.guildId }
                );
            }

            const giveawaysAfterDelete = await getGuildGiveaways(interaction.client, interaction.guildId);
            const stillExistsInDatabase = giveawaysAfterDelete.some(g => g.messageId === messageId);

            if (stillExistsInDatabase) {
                throw new TitanBotError(
                    `Giveaway still exists after deletion: ${messageId}`,
                    ErrorTypes.UNKNOWN,
                    'המחיקה לא נשמרה במסד הנתונים. אנא נסה שנית.',
                    { messageId, guildId: interaction.guildId }
                );
            }

            const statusMsg = deletedMessage
                ? `והודעת ההגרלה נמחקה בהצלחה מהערוץ #${channelName}`
                : `אך הודעת ההגרלה כבר נמחקה בעבר או שהערוץ אינו נגיש לבוט`;

            const winnerIds = Array.isArray(giveaway.winnerIds) ? giveaway.winnerIds : [];
            const hasWinners = winnerIds.length > 0;
            const wasEnded = giveaway.ended === true || giveaway.isEnded === true || hasWinners;

            const winnerStatusMsg = hasWinners
                ? `להגרלה זו כבר נבחרו ${winnerIds.length} זוכה/זוכים.`
                : wasEnded
                    ? 'הגרלה זו הסתיימה בעבר ללא זוכים חוקיים.'
                    : 'לא נבחרו זוכים לפני מחיקת ההגרלה.';

            logger.info(`Giveaway deleted: ${messageId} in ${channelName}`);

            try {
                await logEvent({
                    client: interaction.client,
                    guildId: interaction.guildId,
                    eventType: EVENT_TYPES.GIVEAWAY_DELETE,
                    data: {
                        description: `Giveaway deleted: ${giveaway.prize}`,
                        channelId: giveaway.channelId,
                        userId: interaction.user.id,
                        fields: [
                            {
                                name: 'Prize',
                                value: giveaway.prize || 'Unknown',
                                inline: true
                            },
                            {
                                name: 'Entries',
                                value: (giveaway.participants?.length || 0).toString(),
                                inline: true
                            }
                        ]
                    }
                });
            } catch (logError) {
                logger.debug('Error logging giveaway deletion:', logError);
            }

            return InteractionHelper.safeReply(interaction, {
                embeds: [
                    successEmbed(
                        "ההגרלה נמחקה",
                        `ההגרלה עבור **${giveaway.prize || 'פרס לא ידוע'}** הוסרה בהצלחה ממסד הנתונים, ${statusMsg}. ${winnerStatusMsg}`,
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            });

        } catch (error) {
            logger.error('Error in gdelete command:', error);
            await handleInteractionError(interaction, error, {
                type: 'command',
                commandName: 'gdelete',
                context: 'giveaway_deletion'
            });
        }
    },
};
