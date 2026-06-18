import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes, handleInteractionError } from '../../utils/errorHandler.js';
import { getGuildGiveaways, saveGiveaway } from '../../utils/giveaways.js';
import { 
    selectWinners,
    createGiveawayEmbed, 
    createGiveawayButtons 
} from '../../services/giveawayService.js';
import { logEvent, EVENT_TYPES } from '../../services/loggingService.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("greroll")
        .setDescription("בחירת זוכה/זוכים חדשים (הגרלה חוזרת) עבור הגרלה שהסתיימה.")
        .addStringOption((option) =>
            option
                .setName("messageid")
                .setDescription("מזהה ההודעה (Message ID) של ההגרלה שהסתיימה.")
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
                    "אתה זקוק להרשאת 'ניהול שרת' כדי לבצע הגרלה חוזרת.",
                    { userId: interaction.user.id, guildId: interaction.guildId }
                );
            }

            logger.info(`Giveaway reroll initiated by ${interaction.user.tag} in guild ${interaction.guildId}`);

            const messageId = interaction.options.getString("messageid");

            if (!messageId || !/^\d+$/.test(messageId)) {
                throw new TitanBotError(
                    'Invalid message ID format',
                    ErrorTypes.VALIDATION,
                    'אנא ספק מזהה הודעה (Message ID) תקין.',
                    { providedId: messageId }
                );
            }

            const giveaways = await getGuildGiveaways(
                interaction.client,
                interaction.guildId,
            );

            const giveaway = giveaways.find(g => g.messageId === messageId);

            if (!giveaway) {
                throw new TitanBotError(
                    `Giveaway not found: ${messageId}`,
                    ErrorTypes.VALIDATION,
                    "לא נמצאה הגרלה במסד הנתונים התואמת למזהה ההודעה שסופק.",
                    { messageId, guildId: interaction.guildId }
                );
            }

            if (!giveaway.isEnded && !giveaway.ended) {
                throw new TitanBotError(
                    `Giveaway still active: ${messageId}`,
                    ErrorTypes.VALIDATION,
                    "הגרלה זו עדיין פעילה. אנא השתמש בפקודה `/gend` כדי לסיים אותה תחילה.",
                    { messageId, status: 'active' }
                );
            }

            const participants = giveaway.participants || [];
            
            if (participants.length < giveaway.winnerCount) {
                throw new TitanBotError(
                    `Insufficient participants for reroll: ${participants.length} < ${giveaway.winnerCount}`,
                    ErrorTypes.VALIDATION,
                    "אין מספיק משתתפים רשומים כדי לבחור את כמות הזוכים הנדרשת.",
                    { participantsCount: participants.length, winnersNeeded: giveaway.winnerCount }
                );
            }

            const newWinners = selectWinners(
                participants,
                giveaway.winnerCount,
            );

            const updatedGiveaway = {
                ...giveaway,
                winnerIds: newWinners,
                rerolledAt: new Date().toISOString(),
                rerolledBy: interaction.user.id
            };

            const channel = await interaction.client.channels.fetch(
                giveaway.channelId,
            ).catch(err => {
                logger.warn(`Could not fetch channel ${giveaway.channelId}:`, err.message);
                return null;
            });

            if (!channel || !channel.isTextBased()) {
                
                await saveGiveaway(
                    interaction.client,
                    interaction.guildId,
                    updatedGiveaway,
                );
                
                logger.warn(`Could not find channel for giveaway ${messageId}, but saved new winners to database`);
                
                return InteractionHelper.safeReply(interaction, {
                    embeds: [
                        successEmbed(
                            "ההגרלה החוזרת הושלמה",
                            "הזוכים החדשים נבחרו ונשמרו במסד הנתונים. לא ניתן היה למצוא את הערוץ כדי להכריז על כך.",
                        ),
                    ],
                    flags: MessageFlags.Ephemeral,
                });
            }

            const message = await channel.messages
                .fetch(messageId)
                .catch(err => {
                    logger.warn(`Could not fetch message ${messageId}:`, err.message);
                    return null;
                });

            if (!message) {
                
                await saveGiveaway(
                    interaction.client,
                    interaction.guildId,
                    updatedGiveaway,
                );

                const winnerMentions = newWinners
                    .map((id) => `<@${id}>`)
                    .join(", ");

                const existingPingMsg = giveaway.winnerPingMessageId
                    ? await channel.messages.fetch(giveaway.winnerPingMessageId).catch(() => null)
                    : null;
                if (existingPingMsg) {
                    await existingPingMsg.edit({
                        content: `🔄 **הגרלה חוזרת** 🔄 זוכים חדשים עבור **${giveaway.prize}**: ${winnerMentions}!`,
                    });
                } else {
                    const newPingMsg = await channel.send({
                        content: `🔄 **הגרלה חוזרת** 🔄 זוכים חדשים עבור **${giveaway.prize}**: ${winnerMentions}!`,
                    });
                    updatedGiveaway.winnerPingMessageId = newPingMsg.id;
                }

                logger.info(`Giveaway rerolled (message not found, but announced): ${messageId}`);

                try {
                    await logEvent({
                        client: interaction.client,
                        guildId: interaction.guildId,
                        eventType: EVENT_TYPES.GIVEAWAY_REROLL,
                        data: {
                            description: `Giveaway rerolled: ${giveaway.prize}`,
                            channelId: giveaway.channelId,
                            userId: interaction.user.id,
                            fields: [
                                {
                                    name: 'Prize',
                                    value: giveaway.prize || 'Mystery Prize!',
                                    inline: true
                                },
                                {
                                    name: 'New Winners',
                                    value: winnerMentions,
                                    inline: false
                                },
                                {
                                    name: 'Total Entries',
                                    value: participants.length.toString(),
                                    inline: true
                                }
                            ]
                        }
                    });
                } catch (logError) {
                    logger.debug('Error logging giveaway reroll:', logError);
                }

                return InteractionHelper.safeReply(interaction, {
                    embeds: [
                        successEmbed(
                            "ההגרלה החוזרת הושלמה",
                            `הזוכים החדשים הוכרזו בערוץ ${channel}. (ההודעה המקורית לא נמצאה).`,
                        ),
                    ],
                    flags: MessageFlags.Ephemeral,
                });
            }

            await saveGiveaway(
                interaction.client,
                interaction.guildId,
                updatedGiveaway,
            );

            const newEmbed = createGiveawayEmbed(updatedGiveaway, "reroll", newWinners);
            const newRow = createGiveawayButtons(true);

            await message.edit({
                content: "🔄 **בוצעה הגרלה חוזרת** 🔄",
                embeds: [newEmbed],
                components: [newRow],
            });

            const winnerMentions = newWinners
                .map((id) => `<@${id}>`)
                .join(", ");

            const existingPingMsg = giveaway.winnerPingMessageId
                ? await channel.messages.fetch(giveaway.winnerPingMessageId).catch(() => null)
                : null;
            if (existingPingMsg) {
                await existingPingMsg.edit({
                    content: `🔄 **זוכים בהגרלה החוזרת** 🔄 מזל טוב ${winnerMentions}! אתם הזוכים החדשים בהגרלה על **${giveaway.prize}**! אנא צרו קשר עם יוצר ההגרלה <@${giveaway.hostId}> כדי לקבל את הפרס שלכם.`,
                });
            } else {
                const newPingMsg = await channel.send({
                    content: `🔄 **זוכים בהגרלה החוזרת** 🔄 מזל טוב ${winnerMentions}! אתם הזוכים החדשים בהגרלה על **${giveaway.prize}**! אנא צרו קשר עם יוצר ההגרלה <@${giveaway.hostId}> כדי לקבל את הפרס שלכם.`,
                });
                updatedGiveaway.winnerPingMessageId = newPingMsg.id;
            }

            logger.info(`Giveaway successfully rerolled: ${messageId} with ${newWinners.length} new winners`);

            try {
                await logEvent({
                    client: interaction.client,
                    guildId: interaction.guildId,
                    eventType: EVENT_TYPES.GIVEAWAY_REROLL,
                    data: {
                        description: `Giveaway rerolled: ${giveaway.prize}`,
                        channelId: giveaway.channelId,
                        userId: interaction.user.id,
                        fields: [
                            {
                                name: 'Prize',
                                value: giveaway.prize || 'Mystery Prize!',
                                inline: true
                            },
                            {
                                name: 'New Winners',
                                value: winnerMentions,
                                inline: false
                            },
                            {
                                name: 'Total Entries',
                                value: participants.length.toString(),
                                inline: true
                            }
                        ]
                    }
                });
            } catch (logError) {
                logger.debug('Error logging giveaway reroll event:', logError);
            }

            return InteractionHelper.safeReply(interaction, {
                embeds: [
                    successEmbed(
                        "הגרלה חוזרת בוצעה בהצלחה ✅",
                        `בוצעה הגרלה חוזרת בהצלחה עבור **${giveaway.prize}** בערוץ ${channel}. נבחרו ${newWinners.length} זוכה/זוכים חדשים.`,
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            });

        } catch (error) {
            logger.error('Error in greroll command:', error);
            await handleInteractionError(interaction, error, {
                type: 'command',
                commandName: 'greroll',
                context: 'giveaway_reroll'
            });
        }
    },
};
