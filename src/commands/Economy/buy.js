import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { shopItems } from '../../config/shop/items.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { getGuildConfig } from '../../services/guildConfig.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const SHOP_ITEMS = shopItems;

export default {
    data: new SlashCommandBuilder()
        .setName('buy')
        .setDescription('רכישת פריט מתוך החנות')
        .addStringOption(option =>
            option
                .setName('item_id')
                .setDescription('מזהה הפריט (ID) שברצונך לקנות')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName('quantity')
                .setDescription('כמות לרכישה (ברירת מחדל: 1)')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(10)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

            const userId = interaction.user.id;
            const guildId = interaction.guildId;
            const itemId = interaction.options.getString("item_id").toLowerCase();
            const quantity = interaction.options.getInteger("quantity") || 1;

            const item = SHOP_ITEMS.find(i => i.id === itemId);

            if (!item) {
                throw createError(
                    `Item ${itemId} not found`,
                    ErrorTypes.VALIDATION,
                    `מזהה הפריט \`${itemId}\` אינו קיים בחנות זו.`,
                    { itemId }
                );
            }

            if (quantity < 1) {
                throw createError(
                    "Invalid quantity",
                    ErrorTypes.VALIDATION,
                    "עליך לרכוש כמות של לפחות פריט אחד (1) ומעלה.",
                    { quantity }
                );
            }

            const totalCost = item.price * quantity;

            const guildConfig = await getGuildConfig(client, guildId);
            const PREMIUM_ROLE_ID = guildConfig.premiumRoleId;

            const userData = await getEconomyData(client, guildId, userId);

            if (userData.wallet < totalCost) {
                throw createError(
                    "Insufficient funds",
                    ErrorTypes.VALIDATION,
                    `אתה זקוק ל-**$${totalCost.toLocaleString()}** כדי לרכוש ${quantity}x **${item.name}**, אך יש לך רק **$${userData.wallet.toLocaleString()}** במזומן.`,
                    { required: totalCost, current: userData.wallet, itemId, quantity }
                );
            }

            if (item.type === "role" && itemId === "premium_role") {
                if (!PREMIUM_ROLE_ID) {
                    throw createError(
                        "Premium role not configured",
                        ErrorTypes.CONFIGURATION,
                        "רול הפרימיום של החנות (**Premium Shop Role**) עדיין לא הוגדר על ידי מנהלי השרת.",
                        { itemId }
                    );
                }
                if (interaction.member.roles.cache.has(PREMIUM_ROLE_ID)) {
                    throw createError(
                        "Role already owned",
                        ErrorTypes.VALIDATION,
                        `כבר יש ברשותך את הרול **${item.name}**.`,
                        { itemId, roleId: PREMIUM_ROLE_ID }
                    );
                }
                if (quantity > 1) {
                    throw createError(
                        "Invalid quantity for role",
                        ErrorTypes.VALIDATION,
                        `ניתן לרכוש את הרול **${item.name}** פעם אחת בלבד.`,
                        { itemId, quantity }
                    );
                }
            }

            userData.wallet -= totalCost;

            let successDescription = `רכשת בהצלחה ${quantity}x **${item.name}** בעבור **$${totalCost.toLocaleString()}**!`;

            if (item.type === "role" && itemId === "premium_role") {
                const member = interaction.member;
                const role = interaction.guild.roles.cache.get(PREMIUM_ROLE_ID);

                if (!role) {
                    throw createError(
                        "Role not found",
                        ErrorTypes.CONFIGURATION,
                        "הרול שהוגדר כרול פרימיום אינו קיים עוד בשרת דיסקורד זה.",
                        { roleId: PREMIUM_ROLE_ID }
                    );
                }

                try {
                    await member.roles.add(
                        role,
                        `Purchased role: ${item.name}`,
                    );
                    successDescription += `\n\n**👑 הרול ${role.toString()} הוענק לך כעת בהצלחה!**`;
                } catch (roleError) {
                    userData.wallet += totalCost;
                    await setEconomyData(client, guildId, userId, userData);
                    throw createError(
                        "Role assignment failed",
                        ErrorTypes.DISCORD_API,
                        "הכסף חויב בהצלחה, אך הענקת הרול נכשלה עקב מגבלת הרשאות של הבוט. המזומן הוחזר לחשבונך במלואו.",
                        { roleId: PREMIUM_ROLE_ID, originalError: roleError.message }
                    );
                }
            } else if (item.type === "upgrade") {
                userData.upgrades[itemId] = true;
                successDescription += `\n\n**✨ השדרוג שלך הופעל ונמצא כעת בשימוש!**`;
            } else if (item.type === "consumable") {
                userData.inventory[itemId] =
                    (userData.inventory[itemId] || 0) + quantity;
            }

            await setEconomyData(client, guildId, userId, userData);

            const embed = successEmbed(
                "💰 הרכישה הושלמה בהצלחה",
                successDescription,
            ).addFields({
                name: "יתרה חדשה בארנק",
                value: `$${userData.wallet.toLocaleString()}`,
                inline: true,
            });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed], flags: [MessageFlags.Ephemeral] });
    }, { command: 'buy' })
};
