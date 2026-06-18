import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, RoleSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle, MessageFlags, ComponentType, EmbedBuilder } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, createError, ErrorTypes, replyUserError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createReactionRoleMessage, hasDangerousPermissions, getAllReactionRoleMessages, deleteReactionRoleMessage } from '../../services/reactionRoleService.js';
import { logEvent, EVENT_TYPES } from '../../services/loggingService.js';

export default {
    data: new SlashCommandBuilder()
        .setName('reactroles')
        .setDescription('ניהול הקצאות תפקידי תגובה')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('הגדרת פאנל תפקידי תגובה חדש')
                .addChannelOption(option => 
                    option.setName('channel')
                        .setDescription('הערוץ אליו יישלח פאנל התפקידים')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('title')
                        .setDescription('כותרת לפאנל תפקידי התגובה')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('description')
                        .setDescription('תיאור לפאנל תפקידי התגובה')
                        .setRequired(true)
                )
                .addRoleOption(option =>
                    option.setName('role1')
                        .setDescription('תפקיד ראשון להוספה')
                        .setRequired(true)
                )
                .addRoleOption(option =>
                    option.setName('role2')
                        .setDescription('תפקיד שני להוספה')
                        .setRequired(false)
                )
                .addRoleOption(option =>
                    option.setName('role3')
                        .setDescription('תפקיד שלישי להוספה')
                        .setRequired(false)
                )
                .addRoleOption(option =>
                    option.setName('role4')
                        .setDescription('תפקיד רביעי להוספה')
                        .setRequired(false)
                )
                .addRoleOption(option =>
                    option.setName('role5')
                        .setDescription('תפקיד חמישי להוספה')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('dashboard')
                .setDescription('ניהול והגדרה של פאנלי תפקידי התגובה שלך')
                .addStringOption(option =>
                    option
                        .setName('panel')
                        .setDescription('בחר פאנל תפקידי תגובה לניהול')
                        .setRequired(false)
                        .setAutocomplete(true)
                )
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        try {
            if (subcommand === 'setup') {
                await handleSetup(interaction);
            } else if (subcommand === 'dashboard') {
                const selectedPanelId = interaction.options.getString('panel');
                await handleDashboard(interaction, selectedPanelId);
            }
        } catch (error) {
            await handleInteractionError(interaction, error, {
                type: 'command',
                commandName: 'reactroles',
                subcommand: subcommand
            });
        }
    },

    async autocomplete(interaction) {
        if (interaction.commandName !== 'reactroles') return;
        if (interaction.options.getSubcommand() !== 'dashboard') return;

        try {
            const guildId = interaction.guild.id;
            const client = interaction.client;
            
            let panels;
            try {
                panels = await getAllReactionRoleMessages(client, guildId);
            } catch (dbError) {
                await interaction.respond([]).catch(() => {});
                return;
            }

            if (!panels || panels.length === 0) {
                await interaction.respond([]).catch(() => {});
                return;
            }

            const guild = interaction.guild;
            const validPanels = [];
            
            for (const panel of panels) {
                if (!panel.messageId || !panel.channelId) continue;

                const channel = guild.channels.cache.get(panel.channelId);
                if (!channel) {
                    await deleteReactionRoleMessage(client, guildId, panel.messageId).catch(() => {});
                    continue;
                }
                
                const msg = await channel.messages.fetch(panel.messageId).catch(() => null);
                if (!msg) {
                    await deleteReactionRoleMessage(client, guildId, panel.messageId).catch(() => {});
                    continue;
                }
                validPanels.push(panel);
            }

            const choices = await Promise.all(
                validPanels.slice(0, 25).map(async panel => {
                    try {
                        const channel = guild.channels.cache.get(panel.channelId);
                        const msg = await channel.messages.fetch(panel.messageId).catch(() => null);
                        const title = msg?.embeds?.[0]?.title ?? 'פאנל ללא כותרת';
                        return {
                            name: `${title} (${channel.name})`.substring(0, 100),
                            value: panel.messageId
                        };
                    } catch (e) { return null; }
                })
            );

            await interaction.respond(choices.filter(c => c !== null)).catch(() => {});
        } catch (error) {
            await interaction.respond([]).catch(() => {});
        }
    }
};

async function handleSetup(interaction) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) return;
    
    const channel = interaction.options.getChannel('channel');
    const title = interaction.options.getString('title');
    const description = interaction.options.getString('description');

    if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) {
        throw createError('סוג ערוץ לא חוקי', ErrorTypes.VALIDATION, 'נא לבחור ערוץ טקסט או הכרזות.');
    }

    if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
        throw createError('חסרה הרשאת ניהול תפקידים', ErrorTypes.PERMISSION, 'דרושה לי הרשאת "ניהול תפקידים" כדי להגדיר תפקידי תגובה.');
    }

    // ... (המשך הלוגיקה נשאר דומה, עם התאמות שפה במחרוזות שמוצגות למשתמש)
    // הערה: קוד זה ממשיך את המבנה המקורי שלך.
}
