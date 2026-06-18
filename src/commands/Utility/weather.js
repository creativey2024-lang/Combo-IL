import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const WEATHER_URL = "https://api.open-meteo.com/v1/forecast";

export default {
    data: new SlashCommandBuilder()
        .setName("weather")
        .setDescription("קבלת מידע על מזג האוויר בזמן אמת עבור מיקום מסוים")
        .addStringOption((option) =>
            option
                .setName("city")
                .setDescription("שם העיר, לדוגמה: 'Лондон', 'תל אביב' או 'Tokyo'")
                .setRequired(true),
        ),

    async execute(interaction) {
        try {
            const deferSuccess = await InteractionHelper.safeDefer(interaction);
            if (!deferSuccess) {
                logger.warn(`Weather interaction defer failed`, {
                    userId: interaction.user.id,
                    guildId: interaction.guildId,
                    commandName: 'weather'
                });
                return;
            }

            const city = interaction.options.getString("city");

            const geoResponse = await fetch(
                `${GEOCODING_URL}?name=${encodeURIComponent(city)}`,
            );
            const geoData = await geoResponse.json();

            if (!geoData.results || geoData.results.length === 0) {
                logger.info(`Weather command - city not found`, {
                    userId: interaction.user.id,
                    city: city,
                    guildId: interaction.guildId
                });
                
                // תוקן לשימוש ב-Backticks כדי שהמשתנה יוצג כראוי
                await replyUserError(interaction, { 
                    type: ErrorTypes.USER_INPUT, 
                    message: `לא הצלחנו למצוא מיקום עבור **${city}**. אנא בדקו את איות השם.` 
                });
                return;
            }

            const { latitude, longitude, name, country } = geoData.results[0];
            const cityDisplay = name;

            const weatherResponse = await fetch(
                `${WEATHER_URL}?latitude=${latitude}&longitude=${longitude}&current_weather=true`,
            );
            const weatherData = await weatherResponse.json();

            if (weatherData.error) {
                logger.error(`Weather API error`, {
                    error: weatherData.reason,
                    city: city,
                    userId: interaction.user.id,
                    guildId: interaction.guildId
                });
                await replyUserError(interaction, { 
                    type: ErrorTypes.UNKNOWN, 
                    message: '.התרחשה שגיאה בשירות מזג האוויר' 
                });
                return;
            }

            const current = weatherData.current || weatherData.current_weather || {};
            const temperature = current.temperature != null ? Math.round(current.temperature) : "N/A";
            const humidity = current.relativehumidity ?? current.relative_humidity_2m ?? "N/A";
            const windSpeed = current.windspeed != null ? Math.round(current.windspeed) : "N/A";
            const weatherCode = current.weathercode ?? current.weather_code ?? null;

            const condition = getWeatherDescription(weatherCode);

            const embed = createEmbed({ 
                title: `מזג האוויר ב${cityDisplay}, ${country}`, 
                description: condition.description 
            })
                .addFields(
                    {
                        name: "טמפרטורה",
                        value: `${temperature}°C`,
                        inline: true,
                    },
                    {
                        name: "לחות",
                        value: humidity !== "N/A" ? `${humidity}%` : "N/A",
                        inline: true,
                    },
                    {
                        name: "מהירות הרוח",
                        value: windSpeed !== "N/A" ? `${windSpeed} קמ"ש` : "N/A",
                        inline: true,
                    },
                )
                .setFooter({
                    text: `קו רוחב: ${latitude.toFixed(2)} | קו אורך: ${longitude.toFixed(2)}`,
                });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            logger.info(`Weather command executed`, {
                userId: interaction.user.id,
                city: cityDisplay,
                country: country,
                temperature: temperature,
                guildId: interaction.guildId
            });
        } catch (error) {
            logger.error(`Weather command execution failed`, {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'weather'
            });
            await handleInteractionError(interaction, error, {
                commandName: 'weather',
                source: 'weather_command'
            });
        }
    },
};

function getWeatherDescription(code) {
    if (code >= 0 && code <= 3) {
        return { description: "שמים בהירים / מעונן חלקית ☀️", emoji: "" };
    } else if (code >= 45 && code <= 48) {
        return { description: "ערפל או ערפל קרה 🌫️", emoji: "" };
    } else if (code >= 51 && code <= 67) {
        return { description: "טפטוף או גשם 🌧️", emoji: "" };
    } else if (code >= 71 && code <= 75) {
        return { description: "שלג ❄️", emoji: "" };
    } else if (code >= 80 && code <= 86) {
        return { description: "ממטרים (גשם/שלג) 🌦️", emoji: "" };
    } else if (code >= 95 && code <= 99) {
        return { description: "סופת רעמים ⛈️", emoji: "" };
    }
    return { description: "תנאי מזג אוויר לא ידועים.", emoji: "" };
}
