import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import {
  getCountingGameConfig,
  activateCountingGame,
  disableCountingGame,
  resetCountingGame,
  buildCountingLeaderboard,
  getCountingSystemChoices,
  getCountingSystemLabel,
  getExpectedCountValue,
} from '../../services/countingGameService.js';
import { logger } from '../../utils/logger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('count')
    .setDescription('ניהול משחק הספירה של השרת')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('setup')
        .setDescription('הפעלת משחק ספירה בערוץ טקסט')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('הערוץ שבו יתנהל משחק הספירה')
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText),
        )
        .addStringOption((option) =>
          option
            .setName('system')
            .setDescription('שיטת הספירה שבה תרצו להשתמש')
            .setRequired(true)
            .addChoices(...getCountingSystemChoices()),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('disable').setDescription('השבתת משחק הספירה בשרת זה'),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('status').setDescription('הצגת מצב משחק הספירה הנוכחי'),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('reset')
        .setDescription('איפוס רצף הספירה הנוכחי')
        .addIntegerOption((option) =>
          option
            .setName('start')
            .setDescription('המספר שממנו יתחילו לספור לאחר האיפוס')
            .setMinValue(1),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('leaderboard').setDescription('הצגת לוח המובילים של משחק הספירה'),
    ),
  category: 'Fun',

  async execute(interaction) {
    try {
      const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferSuccess) {
        logger.warn('Count command defer failed', { userId: interaction.user.id, guildId: interaction.guildId });
        return;
      }

      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'עליך להחזיק בהרשאת **ניהול שרת** כדי להשתמש בפקודה זו.' });
      }

      const guildId = interaction.guildId;
      const subcommand = interaction.options.getSubcommand();
      const config = await getCountingGameConfig(interaction.client, guildId);

      if (subcommand === 'setup') {
        const channel = interaction.options.getChannel('channel');
        const system = interaction.options.getString('system');
        if (!channel || channel.type !== ChannelType.GuildText) {
          return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'אנא בחר ערוץ טקסט תקין עבור משחק הספירה.' });
        }

        if (config.enabled && config.channelId && config.channelId !== channel.id) {
          return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `בשרת זה כבר מוגדר ערוץ ספירה פעיל: <#${config.channelId}>. יש להשבית תחילה את המשחק הנוכחי, או להשתמש בערוץ הקיים.` });
        }

        await activateCountingGame(interaction.client, guildId, channel.id, system);
        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            successEmbed(
              'משחק הספירה הופעל!',
              `משכת הספירה פעיל כעת בערוץ ${channel} באמצעות שיטת **${getCountingSystemLabel(system)}**. על השחקנים לספור החל מהמספר **1**, וחל איסור לשלוח שני מספרים ברצף על ידי אותו משתמש.`,
            ),
          ],
        });
      }

      if (subcommand === 'disable') {
        if (!config.enabled) {
          return await InteractionHelper.safeEditReply(interaction, {
            embeds: [infoEmbed('משחק הספירה מושבת', 'משחק הספירה כבר מושבת בשרת זה.')],
          });
        }

        await disableCountingGame(interaction.client, guildId);
        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [successEmbed('משחק הספירה הושבת', 'משחק הספירה הושבת בהצלחה.')],
        });
      }

      if (subcommand === 'status') {
        const fields = [
          { name: 'פעיל', value: config.enabled ? 'כן' : 'לא', inline: true },
          { name: 'ערוץ', value: config.channelId ? `<#${config.channelId}>` : 'לא מוגדר', inline: true },
          { name: 'שיטת ספירה', value: getCountingSystemLabel(config.system) || 'לא מוגדר', inline: true },
          { name: 'המספר הבא', value: `${getExpectedCountValue(config)}`, inline: true },
          { name: 'רצף נוכחי', value: `${config.currentStreak}`, inline: true },
          { name: 'רצף שיא', value: `${config.bestStreak || 0}`, inline: true },
          { name: 'הסופר האחרון', value: config.lastUserId ? `<@${config.lastUserId}>` : 'אין', inline: true },
        ];

        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            createEmbed({
              title: 'מצב משחק הספירה',
              description: 'סקירה כללית של הגדרות משחק הספירה הנוכחיות בשרת.',
              fields,
              color: 'primary',
            }),
          ],
        });
      }

      if (subcommand === 'reset') {
        if (!config.enabled) {
          return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'יש להפעיל תחילה את משחק הספירה באמצעות הפקודה `/count setup`.' });
        }

        const startNumber = interaction.options.getInteger('start') || 1;
        await resetCountingGame(interaction.client, guildId, startNumber);

        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            successEmbed(
              'רצף הספירה אופס',
              `רצף הספירה אופס בהצלחה. התחילו לספור מחדש מהמספר **${startNumber}** בערוץ <#${config.channelId}>.`,
            ),
          ],
        });
      }

      if (subcommand === 'leaderboard') {
        const leaderboard = buildCountingLeaderboard(config, interaction.guild);

        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            createEmbed({
              title: 'לוח המובילים - משחק הספירה',
              description: leaderboard.length > 0 ? leaderboard.join('\n') : 'טרם נרשמו ספירות במשחק זה.',
              color: 'primary',
            }),
          ],
        });
      }

      return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'אנא בחר בפעולת ניהול תקינה עבור משחק הספירה.' });
    } catch (error) {
      logger.error('Count command error:', error);
      return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'משהו השתבש במהלך ניהול משחק הספירה.' });
    }
  },
};
