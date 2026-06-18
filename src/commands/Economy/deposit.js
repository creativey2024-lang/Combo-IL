import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { successEmbed, buildUserErrorEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData, getMaxBankCapacity } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('deposit')
        .setDescription('הפקדת כסף מהארנק לתוך חשבון הבנק שלך')
        .addStringOption(option =>
            option
                .setName('amount')
                .setDescription('הסכום להפקדה (מספר או "all" להפקדת הכל)')
                .setRequired(true)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;
        
        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const amountInput = interaction.options.getString("amount");

        const userData = await getEconomyData(client, guildId, userId);
            
        if (!userData) {
            throw createError(
                "Failed to load economy data",
                ErrorTypes.DATABASE,
                "טעינת נתוני הכלכלה שלך נכשלה. אנא נסה שוב מאוחר יותר.",
                { userId, guildId }
            );
        }
            
        const maxBank = getMaxBankCapacity(userData);
        let depositAmount;

        if (amountInput.toLowerCase() === "all" || amountInput.toLowerCase() === "הכל") {
            depositAmount = userData.wallet;
        } else {
            depositAmount = parseInt(amountInput);

            if (isNaN(depositAmount) || depositAmount <= 0) {
                throw createError(
                    "Invalid deposit amount",
                    ErrorTypes.VALIDATION,
                    `אנא הזן מספר תקין או את המילה 'all'. הזנת: \`${amountInput}\``,
                    { amountInput, userId }
                );
            }
        }

        if (depositAmount === 0) {
            throw createError(
                "Zero deposit amount",
                ErrorTypes.VALIDATION,
                "אין לך מזומן בארנק שבאפשרותך להפקיד.",
                { userId, walletBalance: userData.wallet }
            );
        }

        if (depositAmount > userData.wallet) {
            depositAmount = userData.wallet;
            await interaction.followUp({
                embeds: [
                    buildUserErrorEmbed(
                        'validation',
                        `ניסית להפקיד סכום גבוה ממה שיש לך. מפקיד את יתרת המזומן שברשותך: **$${depositAmount.toLocaleString()}**`
                    )
                ],
                flags: MessageFlags.Ephemeral,
            });
        }

        const availableSpace = maxBank - userData.bank;

        if (availableSpace <= 0) {
            throw createError(
                "Bank is full",
                ErrorTypes.VALIDATION,
                `חשבון הבנק שלך מלא כרגע (תכולה מקסימלית: $${maxBank.toLocaleString()}). רכוש **שדרוג בנק** בחנות כדי להגדיל את המגבלה.`,
                { maxBank, currentBank: userData.bank, userId }
            );
        }

        if (depositAmount > availableSpace) {
            const originalDepositAmount = depositAmount;
            depositAmount = availableSpace;

            if (amountInput.toLowerCase() !== "all" && amountInput.toLowerCase() !== "הכל") {
                await interaction.followUp({
                    embeds: [
                        buildUserErrorEmbed(
                            'validation',
                            `נותר לך מקום פנוי רק עבור **$${depositAmount.toLocaleString()}** בחשבון הבנק (מקסימום: $${maxBank.toLocaleString()}). שאר הכסף יישאר בארנקך.`
                        )
                    ],
                    flags: MessageFlags.Ephemeral,
                });
            }
        }

        if (depositAmount === 0) {
            throw createError(
                "No space or cash for deposit",
                ErrorTypes.VALIDATION,
                "הסכום שניסית להפקיד הוא 0 או שהוא חורג מתכולת הבנק שלך לאחר בדיקת יתרת המזומנים.",
                { depositAmount, availableSpace, walletBalance: userData.wallet }
            );
        }

        userData.wallet -= depositAmount;
        userData.bank += depositAmount;

        await setEconomyData(client, guildId, userId, userData);

        const embed = successEmbed(
            'ההפקדה בוצעה בהצלחה! 🎉',
            `הפקדת בהצלחה **$${depositAmount.toLocaleString()}** לתוך חשבון הבנק שלך.`
        )
            .addFields(
                {
                    name: "יתרה חדשה בארנק",
                    value: `$${userData.wallet.toLocaleString()}`,
                    inline: true,
                },
                {
                    name: "יתרה חדשה בבנק",
                    value: `$${userData.bank.toLocaleString()} / $${maxBank.toLocaleString()}`,
                    inline: true,
                },
            );

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'deposit' })
};
