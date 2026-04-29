const fs = require('fs');
const path = require('path');
const {
  Client,
  Collection,
  REST,
  Routes,
  Events,
  GatewayIntentBits,
  EmbedBuilder,
  PermissionsBitField,
} = require('discord.js');

const { clientId, guildId, token, defaultPrefix } = require('./config.json');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
  ],
});

const setupAPI = require('./bot-api');
const roleChangeLogger = require('./commands/role_change_utils');
roleChangeLogger(client);

client.commands = new Collection();
client.prefixCommands = new Collection();

const commands = [];
const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);
const prefixFilePath = path.join(__dirname, 'commands', 'prefixes.json');

// cache prefixes (avoid repeated sync reads)
let prefixes = {};

function updateActivity(prefix) {
  console.log(`Setting activity to: ${prefix}help`);
  client.user.setActivity(`${prefix}help`, { type: 0 }); // 0 = PLAYING
}

for (const folder of commandFolders) {
  const folderPath = path.join(foldersPath, folder);
  const stat = fs.lstatSync(folderPath);

  if (stat.isDirectory()) {
    const commandFiles = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
      const filePath = path.join(folderPath, file);
      const command = require(filePath);

      if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        commands.push(command.data.toJSON());
        console.log(`Loaded slash command from file: ${file}`);
      } else if ('name' in command && 'execute' in command) {
        client.prefixCommands.set(command.name, command);
        console.log(`Loaded prefixed command from file: ${file}`);
      }
    }
  } else if (folder.endsWith('.js')) {
    const command = require(path.join(foldersPath, folder));

    if ('data' in command && 'execute' in command) {
      client.commands.set(command.data.name, command);
      commands.push(command.data.toJSON());
      console.log(`Loaded slash command from file: ${folder}`);
    } else if ('name' in command && 'execute' in command) {
      client.prefixCommands.set(command.name, command);
      console.log(`Loaded prefixed command from file: ${folder}`);
    }
  }
}

const rest = new REST().setToken(token);

(async () => {
  try {
    console.log(`Refreshing ${commands.length} slash commands.`);

    const data = await rest.put(
      Routes.applicationCommands(clientId),
      { body: commands }
    );

    console.log(`Successfully reloaded ${data.length} slash commands.`);
  } catch (error) {
    console.error(error);
  }
})();

const isExempt = member =>
  member.permissions.has(PermissionsBitField.Flags.Administrator) ||
  member.id === member.guild.ownerId;

// SLASH COMMANDS
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  const channel = interaction.channel;
  const member = interaction.member;

  if (channel.name !== 'bot-spam' && !isExempt(member)) {
    return interaction.reply({
      content: '❌ You can only use commands in #bot-spam.',
      ephemeral: true,
    });
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error('Error executing slash command:', error);

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: 'There was an error while executing this command!',
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: 'There was an error while executing this command!',
        ephemeral: true,
      });
    }
  }
});

client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;

  const guildId = message.guild.id;

  let prefix = defaultPrefix;
  try {
    prefix = prefixes[guildId] || defaultPrefix;
  } catch (error) {
    console.error('Error loading prefixes:', error);
  }

  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();

  const command = client.prefixCommands.get(commandName);
  const member = message.member;

  if (!command) {
    return message.reply(`Unknown command. Use \`${prefix}help\` for help.`);
  }

  if (message.channel.name !== 'bot-spam' && !isExempt(member)) {
    return message.reply('❌ You can only use commands in #bot-spam.');
  }

  try {
    await command.execute(message, args);
  } catch (error) {
    console.error('Error executing command:', error);
    message.reply('There was an error while executing that command!');
  }
});

client.once(Events.ClientReady, client => {
  try {
    prefixes = JSON.parse(fs.readFileSync(prefixFilePath, 'utf8'));
  } catch (error) {
    console.error('Error loading prefixes file:', error);
  }

  updateActivity(prefixes[guildId] || defaultPrefix);
  setupAPI(client);

  console.log(`Logged in as ${client.user.tag}`);
});

client.login(token);
