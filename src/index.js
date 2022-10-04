const config = require('./utils/config')
const { initTelegramClient } = require('./telegramClient')
const notificationManager = require('./services/NotificationManager')
const { initUserTypingActionCron } = require('./crons/userTypingActionCron')
const { TelegramClientCommands } = require('./services/TelegramClientCommands')
const { UserTypingActionManager } = require('./services/UserTypingActionManager')
const { UserChatMessagesBackupManager } = require('./services/UserChatMessagesBackupManager')
const { UserDeleteMessageNotificationManager } = require('./services/UserDeleteMessageNotificationManager')

// For JSON.stringify correct working
BigInt.prototype.toJSON = function () {
    return this.toString()
}

initTelegramClient().then(async (client) => {
    notificationManager.setTelegramClient(client)

    const telegramClientUser = await client.getMe()
    const { value: telegramClientUserId } = telegramClientUser.id

    console.log('Setup telegram client commands manager')
    const telegramClientCommands = new TelegramClientCommands(client, telegramClientUserId)

    let userTypingActionManager
    if (config.features.usersWhoStartedTypingButDidNotSendIt.enabled) {
        console.log('Setup user typing actions manager')
        userTypingActionManager = new UserTypingActionManager()
        initUserTypingActionCron(client, userTypingActionManager)
    }

    let userDeleteMessageNotificationManager
    let chatMessagesBackupManager

    if (config.features.messagesBackupsAndDeletedMessagesNotifications.enabled) {
        if (!config.features.messagesBackupsAndDeletedMessagesNotifications.notifications.disableNotifications) {
            console.log('Setup deleted messages notification manager')
            userDeleteMessageNotificationManager = new UserDeleteMessageNotificationManager(
                client,
                telegramClientUserId,
                config.features.messagesBackupsAndDeletedMessagesNotifications.notifications.temporaryDataStorageMaxLength,
            )
        }

        console.log('Setup message backups channel')
        chatMessagesBackupManager = new UserChatMessagesBackupManager(
            client,
            telegramClientUserId,
            userDeleteMessageNotificationManager,
            {
                includeMutedChats: config.features.messagesBackupsAndDeletedMessagesNotifications.includeMutedChats,
            },
        )
        await chatMessagesBackupManager.setupBackupChannel()
    }

    console.log('Telegram client is running!')
    client.addEventHandler((action) => {
        telegramClientCommands.processAction(action)
        userTypingActionManager && userTypingActionManager.processAction(action)
        chatMessagesBackupManager && chatMessagesBackupManager.processAction(action)
        userDeleteMessageNotificationManager && userDeleteMessageNotificationManager.processAction(action)
    })
})
