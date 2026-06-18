import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import {
  disableCategory,
  enableCategory,
  disableCommand,
  enableCommand,
  resolveCategoryChoice,
  buildCommandRegistry,
  isProtectedCommand,
} from '../../services/commandAccessService.js';
import {
  buildDashboardView,
  handleDashboardComponent,
  createDashboardCollectorFilter,
  isCommandAccessCustomId,
} from './modules/commands_dashboard.js';

const DASHBOARD_TIMEOUT_MS = 10 * 60 * 1000;

function buildCategoryChoices(client) {
  const registry = buildCommandRegistry(client);
  return [...registry.values()]
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
    .slice(0, 25)
    .map((category) => ({
      name: `${category.icon} ${category.displayName}`.slice(0, 100),
      value: category.key,
    }));
}

async function ensureManageGuild(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'יש צורך בהרשאת **ניהול שרת** כדי לנהל פקודות.' });
    return false;
  }

  return true;
}

export default {
  data: new SlashCommandBuilder()
    .setName('commands')
    .setDescription('הפעלה או השבתה של פקודות ומערכות הבוט עבור שרת זה')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('dashboard')
        .setDescription('פתיחת לוח הבקרה האינטראקטיבי לניהול גישה לפקודות'),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('disable')
        .setDescription('השבתת פקודה בודדת או קטגוריה שלמה')
        .addStringOption((option) =>
          option
            .setName('scope')
            .setDescription('בחרו האם להשבית פקודה בודדת או קטגוריה שלמה')
            .setRequired(true)
            .addChoices(
              { name: 'קטגוריה', value: 'category' },
              { name: 'פקודה', value: 'command' },
            ),
        )
        .addStringOption((option) =>
          option
            .setName('target')
            .setDescription('שם הקטגוריה או הפקודה')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('enable')
        .setDescription('הפעלת פקודה בודדת או קטגוריה שלמה')
        .addStringOption((option) =>
          option
            .setName('scope')
            .setDescription('בחרו האם להפעיל פקודה בודדת או קטגוריה שלמה')
            .setRequired(true)
            .addChoices(
              { name: 'קטגוריה', value: 'category' },
              { name: 'פקודה', value: 'command' },
            ),
        )
        .addStringOption((option) =>
          option
            .setName('target')
            .setDescription('שם הקטגוריה או הפקודה')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    ),
  category: 'Core',

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);

    if (focused.name !== 'target') {
      return interaction.respond([]);
    }

    const scope = interaction.options.getString('scope');
    const query = focused.value.toLowerCase();

    if (scope === 'category') {
      const choices = buildCategoryChoices(interaction.client)
        .filter((choice) => choice.name.toLowerCase().includes(query) || choice.value.includes(query))
        .slice(0, 25);
      return interaction.respond(choices);
    }

    // עבור פקודות, שליפת כל הפקודות כולל תתי-פקודות
    const registry = buildCommandRegistry(interaction.client);
    const allCommands = [];
    
    // בדיקה האם החיפוש תואם לשם של קטגוריה - אם כן, נציג את הפקודות מאותה קטגוריה
    const matchedCategory = resolveCategoryChoice(interaction.client, query);
    
    if (matchedCategory) {
      for (const command of matchedCategory.commands) {
        if (!isProtectedCommand(command.name)) {
          allCommands.push(command.name);
        }
      }
    } else {
      for (const category of registry.values()) {
        for (const command of category.commands) {
          if (!isProtectedCommand(command.name)) {
            allCommands.push(command.name);
          }
        }
      }
    }

    const choices = allCommands
      .filter((name) => name.includes(query))
      .slice(0, 25)
      .map((name) => ({ name: `/${name}`, value: name }));

    return interaction.respond(choices);
  },

  async execute(interaction, config, client) {
    try {
      if (!(await ensureManageGuild(interaction))) {
        return;
      }

      const subcommand = interaction.options.getSubcommand();

      if (subcommand === 'dashboard') {
        const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferred) {
          return;
        }

        const view = await buildDashboardView(client, interaction.guildId, interaction.guild, 'overview');
        await InteractionHelper.safeEditReply(interaction, {
          embeds: [view.embed],
          components: view.components,
        });

        const replyMessage = await interaction.fetchReply().catch(() => null);
        if (!replyMessage) {
          return;
        }

        const collector = replyMessage.createMessageComponentCollector({
          filter: createDashboardCollectorFilter(interaction.user.id, interaction.guildId),
          time: DASHBOARD_TIMEOUT_MS,
        });

        collector.on('collect', async (componentInteraction) => {
          try {
            if (!isCommandAccessCustomId(componentInteraction.customId)) {
              return;
            }
            await handleDashboardComponent(componentInteraction, client);
          } catch (error) {
            logger.error('Command access dashboard interaction failed', {
              error: error.message,
              customId: componentInteraction.customId,
              guildId: interaction.guildId,
            });
            await replyUserError(componentInteraction, {
              type: ErrorTypes.UNKNOWN,
              message: error.message || 'עדכון הגישה לפקודה נכשל.',
            }).catch(() => {});
          }
        });

        collector.on('end', async () => {
          const finalView = await buildDashboardView(client, interaction.guildId, interaction.guild, 'overview');
          const disabledComponents = finalView.components.map((row) => {
            const newRow = row.toJSON();
            newRow.components = newRow.components.map((component) => ({ ...component, disabled: true }));
            return newRow;
          });

          await replyMessage.edit({ components: disabledComponents }).catch(() => {});
        });

        return;
      }

      const scope = interaction.options.getString('scope');
      const target = interaction.options.getString('target');
      const isDisable = subcommand === 'disable';

      const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferred) {
        return;
      }

      if (scope === 'category') {
        const category = resolveCategoryChoice(client, target);
        if (!category) {
          return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `לא נמצאה קטגוריה תואמת עבור \`${target}\`. השתמשו ב-\`/commands dashboard\` כדי לעיין בקטגוריות.` });
        }

        if (isDisable) {
          await disableCategory(client, interaction.guildId, category.key);
          return InteractionHelper.safeEditReply(interaction, {
            embeds: [
              successEmbed(
                'הקטגוריה הושבתה',
                `כל הפקודות תחת קטגוריית **${category.displayName}** מושבתות כעת.\nפקודות מערכת מוגנות יישארו זמינות.`,
              ),
            ],
          });
        }

        await enableCategory(client, interaction.guildId, category.key);
        return InteractionHelper.safeEditReply(interaction, {
          embeds: [successEmbed('הקטגוריה הופעלה', `כל הפקודות תחת קטגוריית **${category.displayName}** פעילות כעת (למעט פקודות שהושבתו באופן פרטני).`)],
        });
      }

      const commandName = target.toLowerCase();
      if (isDisable) {
        await disableCommand(client, interaction.guildId, commandName);
        return InteractionHelper.safeEditReply(interaction, {
          embeds: [successEmbed('הפקודה הושבתה', `הפקודה \`/${commandName}\` מושבתת כעת בשרת זה.`)],
        });
      }

      await enableCommand(client, interaction.guildId, commandName);
      return InteractionHelper.safeEditReply(interaction, {
        embeds: [successEmbed('הפקודה הופעלה', `הפקודה \`/${commandName}\` פעילה כעת בשרת זה.`)],
      });
    } catch (error) {
      logger.error('commands command failed', {
        error: error.message,
        stack: error.stack,
        guildId: interaction.guildId,
        userId: interaction.user.id,
      });
      await handleInteractionError(interaction, error, { commandName: 'commands' });
    }
  },
};
