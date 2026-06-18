import { botConfig, getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { createEmbed, infoEmbed, successEmbed } from '../../utils/embeds.js';
import { getGuildConfig, setGuildConfig } from '../../services/guildConfig.js';
import { handleInteractionError, withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { removeVerification, verifyUser } from '../../services/verificationService.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getWelcomeConfig } from '../../utils/database.js';
import verificationDashboard from './modules/verification_dashboard.js';

export default {
    data: new SlashCommandBuilder()
        .setName("verification")
        .setDescription("ניהול מערכת האימות (Verification) של השרת")
        .addSubcommand(subcommand =>
            subcommand
                .setName("setup")
                .setDescription("הגדרת מערכת אימות חדשה")
                .addChannelOption(option =>
                    option
                        .setName("verification_channel")
                        .setDescription("הערוץ שבו תישלח הודעת האימות")
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )
                .addRoleOption(option =>
                    option
                        .setName("verified_role")
                        .setDescription("התפקיד שיינתן למשתמשים שיאמתו את עצמם")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName("message")
                        .setDescription("הודעת אימות מותאמת אישית")
                        .setMaxLength(2000)
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option
                        .setName("button_text")
                        .setDescription("הטקסט שיופיע על כפתור האימות")
                        .setMaxLength(80)
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("remove")
                .setDescription("הסרת אימות ממשתמש מסוים")
                .addUserOption(option =>
                    option
                        .setName("user")
                        .setDescription("המשתמש שברצונכם להסיר ממנו את האימות")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("dashboard")
                .setDescription("פתיחת לוח הבקרה (Dashboard) של מערכת האימות")
        ),

    async execute(interaction, config, client) {
        const wrappedExecute = withErrorHandling(async () => {
            const subcommand = interaction.options.getSubcommand();
            const guild = interaction.guild;

            if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
                throw createError(
                    'Missing ManageGuild permission for verification admin subcommand',
                    ErrorTypes.PERMISSION,
                    'אתה זקוק להרשאת **ניהול שרת** (Manage Server) כדי להשתמש בפקודה זו.',
                    { subcommand, requiredPermission: 'ManageGuild', userId: interaction.user.id }
                );
            }

            switch (subcommand) {
                case "setup":
                    return await handleSetup(interaction, guild, client);
                case "remove":
                    return await handleRemove(interaction, guild, client);
                case "dashboard":
                    return await verificationDashboard.execute(interaction, config, client);
                default:
                    throw createError(
                        `Unknown subcommand: ${subcommand}`,
                        ErrorTypes.VALIDATION,
                        "אנא בחרו בתת-פקודה תקינה.",
                        { subcommand }
                    );
            }
        }, { command: 'verification', subcommand: interaction.options.getSubcommand() });

        return await wrappedExecute(interaction, config, client);
    }
};

async function handleSetup(interaction, guild, client) {
    const verificationChannel = interaction.options.getChannel("verification_channel");
    const verifiedRole = interaction.options.getRole("verified_role");
    const message = interaction.options.getString("message") || botConfig.verification.defaultMessage;
    const buttonText = interaction.options.getString("button_text") || botConfig.verification.defaultButtonText;
    const botMember = guild.members.me;

    if (!botMember) {
        throw createError(
            'Bot member not found in guild cache',
            ErrorTypes.CONFIGURATION,
            'לא הצלחתי לאמת את ההרשאות שלי בשרת זה. אנא נסו שוב בעוד רגע.',
            { guildId: guild.id }
        );
    }

    const requiredChannelPermissions = [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks
    ];
    const missingChannelPerms = requiredChannelPermissions.filter(perm => 
        !verificationChannel.permissionsFor(botMember).has(perm)
    );
    
    if (missingChannelPerms.length > 0) {
        throw createError(
            `Missing channel permissions: ${missingChannelPerms.join(', ')}`,
            ErrorTypes.PERMISSION,
            'אני זקוק להרשאות **צפייה בערוץ**, **שליחת הודעות** ו-**הטמעת קישורים** (Embed Links) בערוץ האימות שנבחר.',
            { missingPermissions: missingChannelPerms, channel: verificationChannel.id }
        );
    }

    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        throw createError(
            "Missing ManageRoles permission",
            ErrorTypes.PERMISSION,
            "אני זקוק להרשאת 'ניהול תפקידים' (Manage Roles) כדי להעניק את תפקיד המאומת.",
            { missingPermission: "ManageRoles" }
        );
    }

    if (verifiedRole.id === guild.id || verifiedRole.managed) {
        throw createError(
            'Invalid verified role selected',
            ErrorTypes.VALIDATION,
            'אנא בחרו בתפקיד רגיל הניתן להענקה (לא תפקיד @everyone או תפקיד המנוהל על ידי בוט/אינטגרציה).',
            { roleId: verifiedRole.id, managed: verifiedRole.managed }
        );
    }

    const botRole = botMember.roles.highest;
    if (verifiedRole.position >= botRole.position) {
        throw createError(
            "Role hierarchy error",
            ErrorTypes.PERMISSION,
            "תפקיד המאומת חייב להיות מתחת לתפקיד הגבוה ביותר שלי בהיררכיית התפקידים של השרת.",
            { rolePosition: verifiedRole.position, botRolePosition: botRole.position }
        );
    }

    const guildConfig = await getGuildConfig(client, guild.id);
    const welcomeConfig = await getWelcomeConfig(client, guild.id);
    const hasAutoVerifyEnabled = Boolean(guildConfig.verification?.autoVerify?.enabled);
    const hasAutoRoleConfigured = Boolean(guildConfig.autoRole) || (Array.isArray(welcomeConfig.roleIds) && welcomeConfig.roleIds.length > 0);

    if (hasAutoVerifyEnabled || hasAutoRoleConfigured) {
        throw createError(
            'Verification setup blocked by conflicting onboarding system',
            ErrorTypes.CONFIGURATION,
            'לא ניתן להפעיל את מערכת האימות כאשר מערכת ה-**AutoVerify** או ה-**AutoRole** מוגדרות בשרת. יש להשבית אותן תחילה.',
            {
                guildId: guild.id,
                hasAutoVerifyEnabled,
                hasAutoRoleConfigured,
                expected: true,
                suppressErrorLog: true
            }
        );
    }

    await InteractionHelper.safeDefer(interaction);

    const verifyEmbed = createEmbed({
        title: "אימות שרת (Verification)",
        description: message,
        color: getColor('success')
    });

    const verifyButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("verify_user")
            .setLabel(buttonText)
            .setStyle(ButtonStyle.Success)
            .setEmoji("✅")
    );

    const verifyMessage = await verificationChannel.send({
        embeds: [verifyEmbed],
        components: [verifyButton]
    });

    guildConfig.verification = {
        enabled: true,
        channelId: verificationChannel.id,
        messageId: verifyMessage.id,
        roleId: verifiedRole.id,
        message: message,
        buttonText: buttonText
    };

    await setGuildConfig(client, guild.id, guildConfig);

    await InteractionHelper.safeEditReply(interaction, {
        embeds: [successEmbed(
            'מערכת האימות עודכנה בהצלחה',
            [
                `**ערוץ:** ${verificationChannel}`,
                `**תפקיד מאומת:** ${verifiedRole}`,
                `**טקסט כפתור:** ${buttonText}`
            ].join('\n')
        )]
    });
}

async function handleRemove(interaction, guild, client) {
    const targetUser = interaction.options.getUser("user");
    
    try {
        const result = await removeVerification(client, guild.id, targetUser.id, {
            moderatorId: interaction.user.id,
            reason: 'admin_removal'
        });

        if (!result.success) {
            if (result.notVerified) {
                return await InteractionHelper.safeReply(interaction, {
                    embeds: [infoEmbed('אינו מאומת', `למשתמש ${targetUser.tag} אין כרגע את תפקיד המאומת בשרת.`)],
                    flags: MessageFlags.Ephemeral
                });
            }
        }

        logger.info('Verification removed via command', {
            guildId: guild.id,
            targetUserId: targetUser.id,
            moderatorId: interaction.user.id
        });

        return await InteractionHelper.safeReply(interaction, {
            embeds: [successEmbed('האימות הוסר', `האימות הוסר בהצלחה מהמשתמש ${targetUser.tag}.`)]
        });

    } catch (error) {
        await handleInteractionError(
            interaction,
            error,
            { command: 'verification', subcommand: 'remove' }
        );
    }
}
