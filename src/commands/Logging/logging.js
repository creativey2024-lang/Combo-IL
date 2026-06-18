import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

import dashboard from './modules/logging_dashboard.js';
import channel from './modules/logging_channel.js';

export default {
    data: new SlashCommandBuilder()
        .setName('logging')
        .setDescription('ניהול מערכת הלוגים של השרת — ערוצים, מסננים וקטגוריות אירועים.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false)
        .addSubcommand((subcommand) =>
            subcommand
                .setName('dashboard')
                .setDescription('פתיחת לוח הבקרה של הלוגים — הגדרת ערוצים, מסננים והפעלת קטגוריות.'),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('channel')
                .setDescription('הגדרה מהירה של ערוץ לוג מבלי לפתוח את לוח הבקרה.')
                .addStringOption((option) =>
                    option
                        .setName('destination')
                        .setDescription('איזה יעד לוג ברצונך להגדיר.')
                        .setRequired(true)
                        .addChoices(
                            { name: 'ביקורת (ניהול, הודעות, חברים…)', value: 'audit' },
                            { name: 'טפסים ופניות', value: 'applications' },
                            { name: 'דיווחים', value: 'reports' },
                        ),
                )
                .addChannelOption((option) =>
                    option
                        .setName('channel')
                        .setDescription('ערוץ הטקסט עבור הלוגים.')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(false),
                )
                .addBooleanOption((option) =>
                    option
                        .setName('disable')
                        .setDescription('הגדר כ-True כדי לבטל ולנקות ערוץ לוג זה.')
                        .setRequired(false),
                ),
        ),

    async execute(interaction, config, client) {
        try {
            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'dashboard') {
                return await dashboard.execute(interaction, config, client);
            }

            if (subcommand === 'channel') {
                return await channel.execute(interaction, config, client);
            }

            await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'תת-פקודה זו אינה מוכרת במערכת.' });
        } catch (error) {
            logger.error('logging command error:', error);
            await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'התרחשה שגיאה בלתי צפויה.' }).catch(() => {});
        }
    },
};
