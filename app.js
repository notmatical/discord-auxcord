const Discord = require("discord.js");
const client = new Discord.Client();
const ytdl = require("ytdl-core");
const request = require("request");
const moment = require('moment');
const fs = require("fs");
const getYouTubeID = require("get-youtube-id");
const fetchVideoInfo = require("youtube-info");

var config = JSON.parse(fs.readFileSync('./settings.json', 'utf-8'));

const yt_api_key = config.yt_api_key;
const prefix = config.prefix;
const discord_token = config.discord_token;

var auxcord_discord = null;
var general_logs = null;
var request_logs = null;
var warning_logs = null;
var error_logs = null;

// CHANGE THIS WHEN PUSHING TO MASTER BRANCH
var devMode = false;

const log = (msg) => {
	console.log(`[${moment().format("YYYY-MM-DD HH:mm:ss")}] ${msg}`);
};

var guilds = {};

client.on('error', () => {
    console.error;
    error_logs.send(`[${moment().format("YYYY-MM-DD HH:mm:ss")}] [ERROR] Check console for stack trace.`);
});
client.on('warn', () => {
    console.warn;
    warning_logs.send(`[${moment().format("YYYY-MM-DD HH:mm:ss")}] [WARN] Check console for stack trace.`);
});

client.login(discord_token);

client.on('message', function(message) {
    const mess = message.content.toLowerCase();
    const args = message.content.split(' ').slice(1).join(" ");

    if(message.author.bot || message.channel.type == "dm") return;

    if (!guilds[message.guild.id]) {
        guilds[message.guild.id] = {
            queue: [],
            queueNames: [],
            isPlaying: false,
            dispatcher: null,
            voiceChannel: null,
            skipReq: 0,
            skippers: []
        };
    }

    // MUSIC \\
    if (mess.startsWith(prefix + "play") || mess.startsWith(prefix + "p")) {

        if (!message.member.voiceChannel || guilds[message.guild.id].voiceConnection === null) return message.channel.send(":x: You have to be in a voice channel to do this.");
        if (!args) return message.channel.send(":x: Specify a link or a song name to search for.");

        if (guilds[message.guild.id].queue.length > 0 || guilds[message.guild.id].isPlaying) {
            fetch_id(args, function(id) {
                add_to_queue(id, message);
                fetchVideoInfo(id, function(err, videoInfo) {
                    if (err) {
                        error_logs.send(`[${moment().format("YYYY-MM-DD HH:mm:ss")}] [ERROR] ${err}`);
                        throw new Error(err);
                    } 

                    var songDuration = seconds_format(videoInfo.duration);

                    const embed = new Discord.RichEmbed()
                    .setAuthor(`Added to Queue..`, `${message.author.avatarURL}`, 'https://trello.com/b/h9zO4sgW/auxcord-discord-bot')
                    .setTitle(`${videoInfo.title}`)
                    .setURL(`${videoInfo.url}`)
                    .setColor("#177bc6")
                    .setThumbnail(`https://i.imgur.com/sNI5Csn.png`)
                    .addField(`Channel`, `${videoInfo.owner}`, true)
                    .addField(`Song Duration`, `${songDuration}`, true)
                    .addField(`Queue Position`, `${guilds[message.guild.id].queue.length}`, true)
                    .addField(`Published On`, `${videoInfo.datePublished}`, true)
                    .setTimestamp()
                    .setFooter(`${message.author.username}`);
                
                    message.channel.send(embed);
                    request_logs.send(`[${moment().format("YYYY-MM-DD HH:mm:ss")}] [REQUEST] **${message.author.tag}** has requested **${videoInfo.title}** to be played.`);

                    guilds[message.guild.id].queueNames.push(videoInfo.title);
                });
            });
        } else {
            guilds[message.guild.id].isPlaying = true;
            fetch_id(args, function(id) {
                guilds[message.guild.id].queue.push(id);
                playMusic(id, message);
                fetchVideoInfo(id, function(err, videoInfo) {
                    if (err) {
                        error_logs.send(`[${moment().format("YYYY-MM-DD HH:mm:ss")}] [ERROR] ${err}`);
                        throw new Error(err);
                    } 

                    var songDuration = seconds_format(videoInfo.duration);

                    const embed = new Discord.RichEmbed()
                    .setAuthor(`Now Playing..`, `${message.author.avatarURL}`, 'https://trello.com/b/h9zO4sgW/auxcord-discord-bot')
                    .setTitle(`${videoInfo.title}`)
                    .setURL(`${videoInfo.url}`)
                    .setColor("#177bc6")
                    .setThumbnail(`https://i.imgur.com/sNI5Csn.png`)
                    .addField(`Channel`, `${videoInfo.owner}`, true)
                    .addField(`Song Duration`, `${songDuration}`, true)
                    .addField(`Published On`, `${videoInfo.datePublished}`, true)
                    .setTimestamp()
                    .setFooter(`${message.author.username}`);
                
                    message.channel.send(embed);
                    request_logs.send(`[${moment().format("YYYY-MM-DD HH:mm:ss")}] [REQUEST] **${message.author.tag}** has requested **${videoInfo.title}** to be played.`);

                    guilds[message.guild.id].queueNames.push(videoInfo.title);
                });
            });
        }

    } else if (mess.startsWith(prefix + "skip") || mess.startsWith(prefix + "s")) {

        if (!guilds[message.guild.id].isPlaying) return message.channel.send(":x: I'm currently not playing anything.");
        if (message.guild.me.voiceChannelID !== message.member.voiceChannelID) return message.channel.send(":x: You must be in the same channel as me to do that.");

        let dj = message.guild.roles.find(dj => dj.name === "DJ");

        let userCount = message.member.voiceChannel.members.size;
        let required = Math.ceil(userCount / 2);

        if (!guilds[message.guild.id].skippers) guilds[message.guild.id].skippers = [];
        if (!guilds[message.guild.id].skippers.indexOf(message.author.id)) return message.channel.send(":x: You've already tried to skip this.");

        guilds[message.guild.id].skippers.push(message.author.id);
        guilds[message.guild.id].skipReq++;

        if (guilds[message.guild.id].skipReq >= required) {
            skip_song(message);
            message.channel.send("**Song has been skipped.**");
        } else if (dj) {
            skip_song(message);
            message.channel.send("**Song has been skipped.**");
        } else {
            message.channel.send(`**Skip the Song?** (${guilds[message.guild.id].skipReq}/${required} ) more votes to skip this shit.`);
        }

    } else if (mess.startsWith(prefix + "leave") || mess.startsWith(prefix + "dc") || mess.startsWith(prefix + "disconnect")) {
        if (message.guild.me.voiceChannelID !== message.member.voiceChannelID) return message.channel.send(":x: You must be in the same channel as me to do that.");
    
        guilds[message.guild.id].queue = [];
        guilds[message.guild.id].queueNames = [];
        guilds[message.guild.id].isPlaying = false;

        message.guild.me.voiceChannel.leave();
    
        message.channel.send("**Disconnected**");

    } else if (mess.startsWith(prefix + "queue") || mess.startsWith(prefix + "q")) {

        const embed = new Discord.RichEmbed()
        .setAuthor(`Current Queue`, `${message.author.avatarURL}`, 'https://trello.com/b/h9zO4sgW/auxcord-discord-bot')
        .setThumbnail(`https://i.imgur.com/sNI5Csn.png`)
        .setColor("#177bc6")
        .setTimestamp()
        .setFooter(`${message.author.username}`)

        for (var i = 0; i < guilds[message.guild.id].queueNames.length; i++) {
            var song = (i + 1) + ". " + guilds[message.guild.id].queueNames[i] + "\n";
            embed.addField(`${song}`, `-`, false);
        }

        message.channel.send(embed);

    } else if (mess.startsWith(prefix + "clear") || mess.startsWith(prefix + "c")) {
        
        if (!guilds[message.guild.id].isPlaying) return message.channel.send(":x: I'm currently not playing anything.");
        if (message.guild.me.voiceChannelID !== message.member.voiceChannelID) return message.channel.send(":x: You must be in the same channel as me to do that.");

        guilds[message.guild.id].queue = [];
        guilds[message.guild.id].queueNames = [];
        guilds[message.guild.id].isPlaying = false;

        message.guild.me.voiceChannel.leave();

        message.channel.send("**Queue has been cleared.**");

    } else if (mess.startsWith(prefix + "nowplaying") || mess.startsWith(prefix + "np")) {
        
        if (!guilds[message.guild.id].isPlaying) return message.channel.send(":x: I'm currently not playing anything.");

        const embed = new Discord.RichEmbed()
        .setAuthor(`Now Playing`, `${message.author.avatarURL}`, 'https://trello.com/b/h9zO4sgW/auxcord-discord-bot')
        .setTitle(`${guilds[message.guild.id].queueNames[0]}`)
        //.setURL(`${videoInfo.url}`)
        .setColor("#177bc6")
        .setTimestamp()
        .setFooter(`${message.author.username}`);

        message.channel.send(embed);

    } 
    
    // FUN \\
    else if (mess.startsWith(prefix + "8ball")) {
        var ballResponses = [
            "Yes! :smile:",
            "No. :frowning:",
            "Maybe.. :stuck_out_tongue:",
            "Who knows... :thinking:"
        ];

        if (!args[0]) return message.channel.send(":x: You must specify a question.");

        if (args[0]) message.channel.send(ballResponses[Math.floor(Math.random() * ballResponses.length)]);
        else message.channel.send(":thinking: Sorry, I didn't quite understand that.");

    } else if (mess.startsWith(prefix + "help")) {
        const embed = new Discord.RichEmbed()
        .setAuthor(`Available Commands`, `${message.author.avatarURL}`, 'https://trello.com/b/h9zO4sgW/auxcord-discord-bot')
        .setTitle(`Utility & Moderation Coming Soon`)
        .setURL("https://trello.com/b/h9zO4sgW/auxcord-discord-bot")
        .setThumbnail(`https://i.imgur.com/sNI5Csn.png`)
        .setColor("#177bc6")
        .addField(`Music`, `${prefix}play, ${prefix}nowplaying, ${prefix}queue, ${prefix}clear, ${prefix}skip, ${prefix}leave`)
        .addBlankField()
        .addField(`Utility`, `Soon`)
        .addBlankField()
        .addField(`Fun`, `${prefix}8ball`)
        .setTimestamp()
        .setFooter(`${message.author.username}`);

        message.channel.send(embed);
    }
});

client.on('ready', function() {
	log(`[INFO] Logged in as ${client.user.tag}.`);
    log(`[INFO] Now serving ${client.users.size} users in ${client.channels.size} channels on ${client.guilds.size} servers.`);

    // assign logging channel ids
    auxcord_discord = client.guilds.get("559918762145611776");
    general_logs = auxcord_discord.channels.get("559936755223101440")
    request_logs = auxcord_discord.channels.get("559935516217311232")
    warning_logs = auxcord_discord.channels.get("559935601143709706")
    error_logs = auxcord_discord.channels.get("559935638657564686")

    general_logs.send(`[${moment().format("YYYY-MM-DD HH:mm:ss")}] [INFO] Logged in as ${client.user.tag}.`);
    general_logs.send(`[${moment().format("YYYY-MM-DD HH:mm:ss")}] [INFO] Now serving ${client.users.size} users in ${client.channels.size} channels on ${client.guilds.size} servers.`);
    
    log("[INFO] Connected Servers:");
    client.guilds.forEach((guild) => {
        log(" - " + guild.name + " (ID: " + guild.id + ")");
    });

    if (devMode) {
        client.user.setPresence({ game: { name: `dev-mode | matical#9282` }, status: `dnd` }).then().catch(console.error);
    } else {
        client.user.setPresence({ game: { name: `slappers | ~help | matical#9282` }, status: `online` }).then().catch(console.error);
    }
});

client.on('guildCreate', guild => {
    log(`[INFO] Bot has been added to: ${guild.name} (id: ${guild.id})`);
    general_logs.send(`[${moment().format("YYYY-MM-DD HH:mm:ss")}] [INFO] Bot has been added to: ${guild.name} (id: ${guild.id})`);
});

client.on("guildDelete", guild => {
    log(`[INFO] Bot has been removed from: ${guild.name} (id: ${guild.id})`);
    general_logs.send(`[${moment().format("YYYY-MM-DD HH:mm:ss")}] [INFO] Bot has been removed from: ${guild.name} (id: ${guild.id})`);
});

client.on('disconnect', function() {
    log(`[INFO] Bot has been disconnected.`);

    /*let vc = guilds[message.guild.id].voiceChannel;
    if (vc) vc.leave();*/
});

function seconds_format(seconds) {
    var h = Math.floor(seconds / 3600);
    var m = Math.floor(seconds % 3600 / 60);
    var s = Math.floor(seconds % 3600 % 60);

    return ('0' + h).slice(-2) + ":" + ('0' + m).slice(-2) + ":" + ('0' + s).slice(-2);
}

function skip_song(message) {
    guilds[message.guild.id].dispatcher.end();
}

function playMusic(id, message) {
    guilds[message.guild.id].voiceChannel = message.member.voiceChannel;

    guilds[message.guild.id].voiceChannel.join().then(function(connection) {
        stream = ytdl("https://www.youtube.com/watch?v=" + id, { filter: 'audioonly' });
        guilds[message.guild.id].skipReq = 0;
        guilds[message.guild.id].skippers = [];

        guilds[message.guild.id].dispatcher = connection.playStream(stream);
        guilds[message.guild.id].dispatcher.on('end', function() {

            guilds[message.guild.id].skipReq = 0;
            guilds[message.guild.id].skippers = [];
            guilds[message.guild.id].queue.shift();
            guilds[message.guild.id].queueNames.shift();

            if (guilds[message.guild.id].queue.length === 0) {
                guilds[message.guild.id].queue = [];
                guilds[message.guild.id].queueNames = [];
                guilds[message.guild.id].isPlaying = false;

                setTimeout(function() {
                    let vc = guilds[message.guild.id].voiceChannel;
                    if (vc) vc.leave();
                }, 30000);
            } else {
                setTimeout(function() {
                    playMusic(guilds[message.guild.id].queue[0], message);
                }, 2000);
            }
        });
    });
}

function fetch_id(str, cb) {
    if (is_youtube(str)) {
        cb(getYouTubeID(str));
    } else {
        search_video(str, function(id) {
            cb(id);
        });
    }
}

function add_to_queue(strID, message) {
    if (is_youtube(strID)) {
        guilds[message.guild.id].queue.push(getYouTubeID(strID));
    } else {
        guilds[message.guild.id].queue.push(strID);
    }
}

function search_video(query, callback) {
    request("https://www.googleapis.com/youtube/v3/search?part=id&type=video&q=" + encodeURIComponent(query) + "&key=" + yt_api_key, function(error, response, body) {
        var json = JSON.parse(body);

        if (!json.error) {
            if (!json.items){
                console.log(`[ERROR] ${json.error.code}`);
                log(body);
                error_logs.send(`[${moment().format("YYYY-MM-DD HH:mm:ss")}] [ERROR] ${json.error.code} TRACE: ${body}`);

                callback("DNk3aEybHic");
            } else {
                callback(json.items[0].id.videoId);
            }
        } else {
            if (json.error.code) {
                log(`[ERROR] ${json.error.code}`);
                log(body);
                error_logs.send(`[${moment().format("YYYY-MM-DD HH:mm:ss")}] [ERROR] ${json.error.code} TRACE: ${body}`);
            } else {
                log("[ERROR] JSON Parse failed. No error code was provided.");
                error_logs.send(`[${moment().format("YYYY-MM-DD HH:mm:ss")}] [ERROR] JSON Parse failed. No error code was provided.`);
            }
        }
    });
}

function is_youtube(str) {
    return str.toLowerCase().indexOf("youtube.com") > -1 || str.toLowerCase().indexOf("youtu.be") > -1;
}
