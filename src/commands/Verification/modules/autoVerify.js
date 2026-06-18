import { botConfig, getColor } from '../../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed } from '../../../utils/embeds.js';
import { getGuildConfig, setGuildConfig } from '../../../services/guildConfig.js';
import { withErrorHandling, createError, ErrorTypes } from '../../../utils/errorHandler.js';
import { validateAutoVerifyCriteria } from '../../../services/verificationService.js';
import { logger } from '../../../utils/logger.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { getWelcomeConfig } from '../../../utils/database.js';
import autoVerifyDashboard from './autoVerifyDashboard.js';

const autoVerifyDefaults = botConfig.verification?.autoVerify || {};
const minAccountAgeDays = autoVerifyDefaults.minAccountAge ?? 1;
const maxAccountAgeDays = autoVerifyDefaults.maxAccountAge ?? 365;
const defaultAccountAgeDays = autoVerifyDefaults.defaultAccountAgeDays ?? 7;

export default {
    data: new SlashCommandBuilder()
        .setName("autoverify")
        .setDescription("הגדרת מערכת האימות האוטומטי בשרת")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName("setup")
                .setDescription("הגדרת אימות אוטומטי ראשוני")
                .addRoleOption(option =>
                    option
                        .setName("role")
                        .setDescription("התפקיד שיינתן למשתמשים העומדים בקריטריונים")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName("criteria")
                        .setDescription("הקריטריון לביצוע אימות אוטומטי")
                        .addChoices(
                            { name: "וותק החשבון", value: "account_age" },
                            { name: "ללא קריטריון (כולם)", value: "none" }
                        )
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option
                        .setName("account_age_days")
                        .setDescription("וותק חשבון מינימלי בימים (נדרש עבור קריטריון וותק החשבון)")
                        .setMinValue(minAccountAgeDays)
                        .setMaxValue(maxAccountAgeDays)
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("dashboard")
                .setDescription("פתיחת לוח הבקרה (Dashboard) של האימות האוטומטי להתאמה אישית")
        ),

    async execute(interaction, config, client) {
        const wrappedExecute = withErrorHandling(async () => {
            const subcommand = interaction.options.getSubcommand();
            const guild = interaction.guild;

            switch (subcommand) {
                case "setup":
                    return await handleSetup(interaction, guild, client);
                case "dashboard":
                    return await autoVerifyDashboard.execute(interaction, config, client);
                default:
                    throw createError(
                        `Unknown subcommand: ${subcommand}`,
                        ErrorTypes.VALIDATION,
                        "נבחרה תת-פקודה לא תקינה.",
                        { subcommand }
                    );
            }
        }, { command: 'autoverify', subcommand: interaction.options.getSubcommand() });

        return await wrappedExecute(interaction, config, client);
    }
};

async function handleSetup(interaction, guild, client) {
    const criteria = interaction.options.getString("criteria");
    const accountAgeDays = interaction.options.getInteger("account_age_days") || defaultAccountAgeDays;
    const targetRole = interaction.options.getRole("role");

    await InteractionHelper.safeDefer(interaction);

    try {
        const guildConfig = await getGuildConfig(client, guild.id);
        const welcomeConfig = await getWelcomeConfig(client, guild.id);
        const verificationEnabled = Boolean(guildConfig.verification?.enabled);
        const hasAutoRoleConfigured = Boolean(guildConfig.autoRole) || (Array.isArray(welcomeConfig.roleIds) && welcomeConfig.roleIds.length > 0);

        if (verificationEnabled || hasAutoRoleConfigured) {
            throw createError(
                'Auto-verify enable blocked by conflicting onboarding system',
                ErrorTypes.CONFIGURATION,
                'לא ניתן להפעיל את מערכת ה-**AutoVerify** כאשר מערכת האימות הרגילה או מערכת ה-AutoRole מוגדרות בשרת. יש להשבית אותן תחילה.',
                {
                    guildId: guild.id,
                    verificationEnabled,
                    hasAutoRoleConfigured,
                    expected: true,
                    suppressErrorLog: true
                }
            );
        }

        const botMember = guild.members.me;
        if (!botMember) {
            throw createError(
                'Bot member not found in guild cache',
                ErrorTypes.CONFIGURATION,
                'לא הצלחתי לאמת את ההרשאות שלי בשרת זה. אנא נסו שוב בעוד רגע.',
                { guildId: guild.id }
            );
        }

        if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
            throw createError(
                'Missing ManageRoles permission',
                ErrorTypes.PERMISSION,
                "אני זקוק להרשאת 'ניהול תפקידים' (Manage Roles) כדי להעניק תפקידים באימות האוטומטי.",
                { guildId: guild.id }
            );
        }

        if (targetRole.id === guild.id || targetRole.managed) {
            throw createError(
                'Invalid auto-verify role selected',
                ErrorTypes.VALIDATION,
                'אנא בחרו בתפקיד רגיל הניתן להענקה (לא תפקיד @everyone או תפקיד המנוהל על ידי אינטגרציה/בוט אחר).',
                { guildId: guild.id, roleId: targetRole.id, managed: targetRole.managed }
            );
        }

        if (targetRole.position >= botMember.roles.highest.position) {
            throw createError(
                'Role hierarchy error for auto-verify setup',
                ErrorTypes.PERMISSION,
                'התפקיד שנבחר עבור האימות האוטומטי חייב להיות מתחת לתפקיד הגבוה ביותר שלי בהיררכיית התפקידים של השרת.',
                { guildId: guild.id, roleId: targetRole.id, rolePosition: targetRole.position, botRolePosition: botMember.roles.highest.position }
            );
        }

        validateAutoVerifyCriteria(criteria, criteria === 'account_age' ? accountAgeDays : 1);
        
        if (!guildConfig.verification) {
            guildConfig.verification = {};
        }

        guildConfig.verification.autoVerify = {
            enabled: true,
            criteria: criteria,
            accountAgeDays: criteria === "account_age" ? accountAgeDays : null,
            roleId: targetRole.id,
            configuredVia: 'setup'
        };

        await setGuildConfig(client, guild.id, guildConfig);

        let criteriaDescription = "";
        switch (criteria) {
            case "account_age":
                criteriaDescription = `וותק חשבון של לפחות \`${accountAgeDays} ימים\``;
                break;
            case "none":
                criteriaDescription = "כל המשתמשים באופן מיידי";
                break;
        }

        logger.info('Auto-verify enabled', {
            guildId: guild.id,
            criteria,
            accountAgeDays: criteria === 'account_age' ? accountAgeDays : null,
            roleId: targetRole.id
        });

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [successEmbed(
                "מערכת האימות האוטומטי הוגדרה בהצלחה",
                `הגדרות האימות האוטומטי עודכנו בהצלחה!\n\n**התפקיד שיוענק:** ${targetRole}\n**הקריטריון:** ${criteriaDescription}\n\nמשתמשים שיעמדו בקריטריונים אלו יקבלו את התפקיד באופן אוטומטי ברגע הצטרפותם לשרת.`
            )]
        });

    } catch (error) {
        throw error;
    }
}
