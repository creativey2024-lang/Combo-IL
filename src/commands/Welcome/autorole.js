import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder, MessageFlags } from 'discord.js';
import { getWelcomeConfig, updateWelcomeConfig } from '../../utils/database.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getGuildConfig } from '../../services/guildConfig.js';

function createAutoroleInfoEmbed(description) {
    return new EmbedBuilder()
        .setColor(getColor('primary'))
        .setDescription(description)
        .setFooter({ text: new Date().toLocaleString('he-IL') });
}

export default {
    data: new SlashCommandBuilder()
        .setName('autorole')
        .setDescription('ניהול תפקידים המוענקים באופן אוטומטי לחברים חדשים')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('הוספת תפקיד שיוענק אוטומטית לחברים חדשים')
                .addRoleOption(option =>
                    option.setName('role')
                        .setDescription('התפקיד שברצונכם להוסיף')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('הסרת תפקיד מהענקה אוטומטית')
                .addRoleOption(option =>
                    option.setName('role')
                        .setDescription('התפקיד שברצונכם להסיר')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('הצגת כל התפקידים המוענקים אוטומטית')),

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Autorole interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'autorole'
            });
            return;
        }

        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'אתה זקוק להרשאת **ניהול שרת** כדי להשתמש בפקודה `/autorole`.' });
        }

        const { options, guild, client } = interaction;
        const subcommand = options.getSubcommand();

        if (subcommand === 'add') {
            const role = options.getRole('role');

            const guildConfig = await getGuildConfig(client, guild.id);
            const verificationEnabled = Boolean(guildConfig.verification?.enabled);
            const autoVerifyEnabled = Boolean(guildConfig.verification?.autoVerify?.enabled);

            if (verificationEnabled || autoVerifyEnabled) {
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'לא ניתן להוסיף AutoRole כאשר מערכת האימות (Verification) או האימות האוטומטי (AutoVerify) מופעלים. יש להשבית אותם תחילה.' });
            }
            
            if (role.position >= guild.members.me.roles.highest.position) {
                logger.warn(`[Autorole] User ${interaction.user.tag} tried to add role ${role.name} (${role.id}) higher than bot's highest role in ${guild.name}`);
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'אני לא יכול להעניק תפקידים שנמצאים מעל התפקיד הגבוה ביותר שלי בהיררכיה.' });
            }

            try {
                const config = await getWelcomeConfig(client, guild.id);
                const existingRoles = config.roleIds || [];
                const currentRoleId = existingRoles[0] || null;

                if (currentRoleId === role.id) {
                    logger.info(`[Autorole] User ${interaction.user.tag} tried to add duplicate role ${role.name} (${role.id}) in ${guild.name}`);
                    return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `התפקיד ${role} כבר מוגדר להענקה אוטומטית.` });
                }

                await updateWelcomeConfig(client, guild.id, {
                    roleIds: [role.id]
                });

                logger.info(`[Autorole] Set single auto-role to ${role.name} (${role.id}) in ${guild.name} by ${interaction.user.tag}`);
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [createAutoroleInfoEmbed(
                        currentRoleId
                            ? `✅ תפקיד ה-Auto-role עודכן ל-${role}. ניתן להגדיר תפקיד אוטומטי אחד בלבד.`
                            : `✅ תפקיד ה-Auto-role הוגדר ל-${role}.`
                    )],
                    flags: MessageFlags.Ephemeral
                });
            } catch (error) {
                logger.error(`[Autorole] Failed to add role for guild ${guild.id}:`, error);
                await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'התרחשה שגיאה בעת הוספת התפקיד. אנא נסו שוב.' });
            }
        } 
        
        else if (subcommand === 'remove') {
            const role = options.getRole('role');

            try {
                const config = await getWelcomeConfig(client, guild.id);
                const existingRoles = config.roleIds || [];
                
                if (!existingRoles.includes(role.id)) {
                    logger.info(`[Autorole] User ${interaction.user.tag} tried to remove non-existent role ${role.name} (${role.id}) in ${guild.name}`);
                    return await replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: `התפקיד ${role} אינו מוגדר כתפקיד להענקה אוטומטית.` });
                }

                const updatedRoles = existingRoles.filter(id => id !== role.id);
                
                await updateWelcomeConfig(client, guild.id, {
                    roleIds: updatedRoles
                });

                logger.info(`[Autorole] Removed role ${role.name} (${role.id}) from auto-assign in ${guild.name} by ${interaction.user.tag}`);
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [createAutoroleInfoEmbed(`✅ התפקיד ${role} הוסר ממערכת ההענקה האוטומטית.`)],
                    flags: MessageFlags.Ephemeral
                });
            } catch (error) {
                logger.error(`[Autorole] Failed to remove role for guild ${guild.id}:`, error);
                await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'התרחשה שגיאה בעת הסרת התפקיד. אנא נסו שוב.' });
            }
        }
        
        else if (subcommand === 'list') {
            try {
                const guildConfig = await getGuildConfig(client, guild.id);
                const verificationEnabled = Boolean(guildConfig.verification?.enabled);
                const autoVerifyEnabled = Boolean(guildConfig.verification?.autoVerify?.enabled);
                
                const conflictSummary = [
                    verificationEnabled ? 'מערכת האימות (Verification) מופעלת' : null,
                    autoVerifyEnabled ? 'מערכת האימות האוטומטי (AutoVerify) מופעלת' : null
                ].filter(Boolean).join('\n');

                const config = await getWelcomeConfig(client, guild.id);
                const autoRoles = Array.isArray(config.roleIds) ? config.roleIds : [];

                const singleRoleIds = autoRoles.length > 1 ? [autoRoles[0]] : autoRoles;
                if (singleRoleIds.length !== autoRoles.length) {
                    await updateWelcomeConfig(client, guild.id, {
                        roleIds: singleRoleIds
                    });
                    logger.info(`[Autorole] Trimmed auto-role list to one role in ${interaction.guild.name}`);
                }

                if (singleRoleIds.length === 0) {
                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [createAutoroleInfoEmbed(`ℹ️ לא הוגדרו תפקידים להענקה אוטומטית.${conflictSummary ? `\n\n⚠️ חוסמי מערכת:\n${conflictSummary}` : ''}`)],
                        flags: MessageFlags.Ephemeral
                    });
                }

                const roles = await guild.roles.fetch();
                const validRoles = [];
                const invalidRoleIds = [];
                
                for (const roleId of singleRoleIds) {
                    const role = roles.get(roleId);
                    if (role) {
                        validRoles.push(role);
                    } else {
                        invalidRoleIds.push(roleId);
                    }
                }

                if (invalidRoleIds.length > 0) {
                    logger.info(`[Autorole] Cleaning up ${invalidRoleIds.length} invalid role(s) from guild ${interaction.guild.name}`);
                    const updatedRoles = singleRoleIds.filter(id => !invalidRoleIds.includes(id));
                    await updateWelcomeConfig(client, guild.id, {
                        roleIds: updatedRoles
                    });
                }

                if (validRoles.length === 0) {
                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [createAutoroleInfoEmbed(`ℹ️ לא נמצא תפקיד אוטומטי תקין. תפקידים שאינם תקינים הוסרו מהמערכת.${conflictSummary ? `\n\n⚠️ חוסמי מערכת:\n${conflictSummary}` : ''}`)],
                        flags: MessageFlags.Ephemeral
                    });
                }

                const embed = new EmbedBuilder()
                    .setColor(getColor('info'))
                    .setTitle('תפקיד להענקה אוטומטית')
                    .setDescription(`${validRoles[0]}${conflictSummary ? `\n\n⚠️ חוסמי מערכת:\n${conflictSummary}` : ''}`)
                    .setFooter({ text: 'ניתן להגדיר תפקיד אוטומטי אחד בלבד.' });

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [embed],
                    flags: MessageFlags.Ephemeral
                });

            } catch (error) {
                logger.error(`[Autorole] Failed to list roles for guild ${guild.id}:`, error);
                await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'התרחשה שגיאה בעת הצגת התפקידים האוטומטיים. אנא נסו שוב.' });
            }
        }
    },
};
