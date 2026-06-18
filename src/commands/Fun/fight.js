import { SlashCommandBuilder } from 'discord.js';
import { successEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const EMBED_DESCRIPTION_LIMIT = 4096;

export default {
    data: new SlashCommandBuilder()
    .setName("fight")
    .setDescription("התחלת קרב סימולציה מבוסס טקסט 1 על 1.")
    .addUserOption((option) =>
      option
        .setName("opponent")
        .setDescription("המשתמש שתרצו להילחם מולו")
        .setRequired(true),
    ),
  category: 'Fun',

  async execute(interaction, config, client) {
    try {
      await InteractionHelper.safeDefer(interaction);

      const challenger = interaction.user;
      const opponent = interaction.options.getUser("opponent");

      if (challenger.id === opponent.id) {
        const embed = warningEmbed(
          `**${challenger.username}**, אתה לא יכול להילחם נגד עצמך! זה תיקו עוד לפני שהתחלנו.`,
          "⚔️ אתגר לא חוקי"
        );
        return await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      }

      if (opponent.bot) {
        const embed = warningEmbed(
          "אתה לא יכול להילחם בבוטים! אתגר אדם אמיתי במקום.",
          "⚔️ יריב לא חוקי"
        );
        return await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      }

      const winner = rand(0, 1) === 0 ? challenger : opponent;
      const loser = winner.id === challenger.id ? opponent : challenger;
      const rounds = rand(3, 7);
      const damage = rand(10, 50);

      const log = [];
      log.push(
        `💥 **${challenger.username}** מזמין את **${opponent.username}** לדו-קרב! (הטוב מ-${rounds} סיבובים)`,
      );

      for (let i = 1; i <= rounds; i++) {
        const attacker = rand(0, 1) === 0 ? challenger : opponent;
        const target = attacker.id === challenger.id ? opponent : challenger;
        const action = [
          "שולח אגרוף פרוע",
          "מנחית מכה קריטית",
          "מטיל כישוף חלש",
          "חוסם ומבצע מתקפת נגד",
        ][rand(0, 3)];
        log.push(
          `\n**סיבוב ${i}:** ${attacker.username} ${action} על ${target.username} וגורם ל-${rand(1, damage)} נזק!`,
        );
      }

      const outcomeText = log.join("\n");
      const winnerText = `👑 **${winner.username}** הביס את ${loser.username} וזכה בניצחון המוחץ!`;
      const fullDescription = `${outcomeText}\n\n${winnerText}`;

      const description = fullDescription.length <= EMBED_DESCRIPTION_LIMIT
        ? fullDescription
        : `${fullDescription.slice(0, EMBED_DESCRIPTION_LIMIT - 15)}\n\n...`;

      const embed = successEmbed(
        description,
        "🏆 הדו-קרב הסתיים!"
      );

      await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      logger.debug(`Fight command executed between ${challenger.id} and ${opponent.id} in guild ${interaction.guildId}`);
    } catch (error) {
      logger.error('Fight command error:', error);
      await handleInteractionError(interaction, error, {
        commandName: 'fight',
        source: 'fight_command'
      });
    }
  },
};
