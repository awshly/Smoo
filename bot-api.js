const express = require('express');
const app = express();
const PORT = 3000;

module.exports = (client) => {
  app.get('/guilds', async (req, res) => {
    try {
      const guildsData = await Promise.all(
        client.guilds.cache.map(async (guild) => {
          await guild.members.fetch({ force: false }).catch(() => {});

          const members = guild.members.cache.map(member => ({
            username: member.user.username,
            status: member.presence?.status || 'offline'
          }));

          return {
            id: guild.id,
            name: guild.name,
            members: members
          };
        })
      );

      res.json({
        count: guildsData.length,
        guilds: guildsData
      });
    } catch (err) {
      console.error('Error building guild list:', err);
      res.status(500).json({ error: 'Failed to fetch guild data.' });
    }
  });

  app.listen(PORT, () => {
    console.log(`SmooBot API running on port ${PORT}`);
  });
};
