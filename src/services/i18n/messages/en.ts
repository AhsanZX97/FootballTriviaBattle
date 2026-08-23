/**
 * The source catalogue. Every other locale is typed as `Record<MessageKey,
 * string>`, so adding a key here is a compile error in es/fr/de/it until they
 * catch up — the type checker is the completeness test.
 *
 * `{placeholders}` are substituted by `t()`. Keep them in every translation.
 *
 * Screen labels are authored in the case they render in; the pixel font has no
 * lowercase-to-uppercase transform applied in CSS, so UPPERCASE here is
 * deliberate. Translations should match the source's case.
 */
export const en = {
  // --- shared ---
  'common.back': 'BACK',
  'common.cancel': 'CANCEL',
  'common.close': 'CLOSE',
  'common.closeAria': 'Close',
  'common.loading': 'Loading…',

  // --- intro menu ---
  'intro.logoAlt': 'Football Trivia Battle',
  'intro.playNow': 'PLAY NOW',
  'intro.shop': 'SHOP',
  'intro.signIn': 'SIGN IN',
  'intro.signOut': 'SIGN OUT',
  'intro.pressStart': 'PRESS START',
  'intro.localCoins': '{coins} COINS EARNED',
  'intro.localCoinsCta': 'Sign in to save them',
  'intro.claimed': 'WELCOME! +{coins} COINS',

  // --- language picker ---
  'language.title': 'LANGUAGE',
  'language.aria': 'Change language',

  // --- auth ---
  'auth.title.signin': 'SIGN IN',
  'auth.title.signup': 'SIGN UP',
  'auth.title.reset': 'RESET PASSWORD',
  'auth.usernameOrEmail': 'Username or email',
  'auth.password': 'Password',
  'auth.username': 'Username',
  'auth.email': 'Email',
  'auth.signIn': 'SIGN IN',
  'auth.signingIn': 'SIGNING IN…',
  'auth.signUpLink': 'Sign Up',
  'auth.forgotPassword': 'Forgot password?',
  'auth.signUp': 'SIGN UP',
  'auth.signingUp': 'SIGNING UP…',
  'auth.minChars': 'min 8 characters',
  'auth.backToSignIn': 'back to sign in',
  'auth.backToMenu': 'Back to menu',
  'auth.resetLead': "Enter your account email and we'll send an 8-digit code.",
  'auth.sending': 'SENDING…',
  'auth.sendCode': 'SEND CODE',
  'auth.codeSentTo': 'Code sent to {email}',
  'auth.codePlaceholder': '8-digit code',
  'auth.codeAria': 'Code',
  'auth.newPassword': 'New password',
  'auth.resetting': 'RESETTING…',
  'auth.resetPassword': 'RESET PASSWORD',
  'auth.resendCode': 'Resend code',
  'auth.error.badCredentials': 'Invalid username/email or password.',
  'auth.error.usernameFormat': 'Username must be 3-16 characters: letters, numbers, underscore only.',
  'auth.error.passwordLength': 'Password must be at least 8 characters.',
  'auth.error.emailInvalid': 'Enter a valid email address.',
  'auth.error.codeFormat': 'Enter the 8-digit code from your email.',
  'auth.error.usernameTaken': 'Username already taken.',
  'auth.error.codeInvalid': 'Invalid or expired code.',
  'auth.error.emailTaken': 'That email is already registered.',
  'auth.error.rateLimited': 'Too many attempts. Wait a moment and try again.',
  'auth.error.network': "Couldn't reach the server. Check your connection.",
  'auth.error.generic': 'Something went wrong. Try again.',

  // --- lobby ---
  'lobby.title': 'PLAY NOW',
  'lobby.yourName': 'Your name',
  'lobby.randomiseName': 'Randomise name',
  'lobby.rename': 'RENAME',
  'lobby.newUsername': 'New username',
  'lobby.saveName': 'SAVE',
  'lobby.quickMatch': 'QUICK MATCH',
  'lobby.friendlyMatch': 'FRIENDLY MATCH',
  'lobby.signInToChallenge': 'Sign in to challenge friends',
  'lobby.findingMatch': 'FINDING MATCH',

  // --- pre-match countdown ---
  'prematch.matchFound': 'MATCH FOUND!',
  'prematch.vs': 'vs {name}',
  'prematch.youGoFirst': 'YOU GO FIRST',
  'prematch.goesFirst': '{name} GOES FIRST',

  // --- match ---
  'match.scoreboardAria': 'scoreboard',
  'match.questionAria': 'question',
  'match.kicksAria': '{side} kicks',
  'match.you': 'YOU',
  'match.opponent': 'OPPONENT',
  'match.yourKick': 'YOUR KICK',
  'match.opponentKick': "{name}'S KICK…",
  'match.waitingFor': 'WAITING FOR {name}…',
  'match.connectionLost': 'CONNECTION LOST',
  'match.lobby': 'LOBBY',
  'match.mainMenu': 'MAIN MENU',
  'match.abandoned': 'MATCH ABANDONED',
  'match.youWin': 'YOU WIN',
  'match.youLose': 'YOU LOSE',
  'match.opponentLeft': '{name} LEFT',
  'match.rematch': 'REMATCH ({votes}/2)',
  'match.loadFailed': "COULDN'T LOAD QUESTIONS",

  // --- pitch scene ---
  'scene.goal': 'GOAL!',
  'scene.miss': 'MISS!',
  'scene.saved': 'SAVED!',
  'scene.scores': '{name} SCORES!',
  'scene.shootingAria': 'you are shooting',
  'scene.keepingAria': 'you are in goal',
  'coinReward.aria': 'You earned {amount} coins',

  // --- shop ---
  'shop.title': 'SHOP',
  'shop.aria': 'Shop',
  'shop.tab.gkSkin': 'SKIN',
  'shop.tab.ballSkin': 'BALL',
  'shop.tab.goalSound': 'SOUNDS',
  'shop.empty.gkSkin': 'No keeper skins yet.',
  'shop.empty.ballSkin': 'No ball skins yet.',
  'shop.empty.goalSound': 'No goal sounds yet.',
  'shop.owned': 'OWNED',
  'shop.equipped': 'EQUIPPED',
  'shop.equip': 'EQUIP',
  'shop.equipping': 'EQUIPPING…',
  'shop.purchased': 'PURCHASED',
  'shop.buy': 'BUY',
  'shop.buying': 'BUYING…',
  'shop.confirmBuy': 'Buy {name}?',
  'shop.confirmBuyAria': 'Confirm purchase',
  'shop.confirmEquipAria': 'Equip item',
  'shop.previewAria': 'Preview {name}',
  'shop.error.equipFailed': 'Could not equip that item.',
  'shop.error.purchaseFailed': 'Could not complete that purchase.',
  'shop.error.insufficient': 'Not enough coins.',

  // --- customize panel ---
  'customize.default': 'DEFAULT',
  'customize.empty.gkSkin': 'No keeper skins owned yet.',
  'customize.empty.ballSkin': 'No ball skins owned yet.',
  'customize.empty.goalSound': 'No goal sounds owned yet.',

  // --- account popup ---
  'account.title': 'ACCOUNT',
  'account.aria': 'Account',
  'account.tab.daily': 'DAILY',
  'account.tab.friends': 'FRIENDS',
  'account.tab.stats': 'STATS',
  'account.tab.custom': 'CUSTOM',

  // --- friends ---
  'friends.button': 'Friends',
  'friends.buttonPending': 'Friends ({count} pending requests)',
  'friends.search': 'SEARCH PLAYER',
  'friends.searchAria': 'Search for a player by username',
  'friends.searching': 'Searching…',
  'friends.noPlayers': 'No players found.',
  'friends.requests': 'REQUESTS',
  'friends.friends': 'FRIENDS',
  'friends.sent': 'SENT',
  'friends.add': 'ADD',
  'friends.accept': 'ACCEPT',
  'friends.noFriendsHint': 'No friends yet — search a username to add one.',
  'friends.noFriends': 'No friends yet.',
  'friends.challenge': 'CHALLENGE',
  'friends.online': 'Online',
  'friends.offline': 'Offline',
  'friends.isOffline': '{name} is offline',
  'friends.comingSoon': 'Coming soon',
  'friends.acceptAria': 'Accept {name}',
  'friends.declineAria': 'Decline {name}',
  'friends.removeAria': 'Remove {name}',
  'friends.cancelRequestAria': 'Cancel request to {name}',
  'friends.error.notFound': 'No player with that username.',
  'friends.error.alreadyFriends': 'You are already friends.',
  'friends.error.alreadyPending': 'Request already pending.',
  'friends.error.self': "You can't add yourself.",
  'friends.signInNote': 'Sign in to add friends and challenge them to a match.',
  'friends.error.sendFailed': 'Could not send request.',

  // --- live challenges ---
  'challenge.incomingAria': 'Incoming challenge',
  'challenge.challengesYou': '{name} challenges you!',
  'challenge.accept': 'ACCEPT',
  'challenge.decline': 'DECLINE',
  'challenge.waitingAria': 'Waiting for opponent',
  'challenge.waitingFor': 'Waiting for {name}',
  'challenge.failed.offline': '{name} is offline.',
  'challenge.failed.busy': '{name} is in a match.',
  'challenge.failed.declined': '{name} declined.',
  'challenge.failed.expired': "{name} didn't respond.",
  'challenge.failed.gone': '{name} went offline.',
  'challenge.withdrawn': 'Challenge withdrawn.',

  // --- get coins ---
  'getcoins.title': 'GET COINS',
  'getcoins.aria': 'Get coins',
  'getcoins.watchAdLabel': 'WATCH A SHORT AD',
  'getcoins.loading': 'LOADING…',
  'getcoins.comeBackTomorrow': 'COME BACK TOMORROW',
  'getcoins.watchAd': 'WATCH AD',
  'getcoins.upToPerDay': 'Up to {max} per day',
  'getcoins.leftToday': '{remaining} of {max} left today',
  'getcoins.coinPacks': 'COIN PACKS',
  'getcoins.getCoinsAria': 'Get coins',
  'coins.error.unavailable': 'No ad available right now. Try again in a moment.',
  'coins.error.rateLimited': "That's all the ad rewards for now — check back later.",
  'coins.error.signedOutBuy': 'Sign in to buy coins.',
  'coins.error.purchaseFailed':
    "That purchase didn't go through. You have not been charged for coins you didn't receive.",
  'coins.error.storeUnavailable': 'The store is unavailable right now. Try again in a moment.',

  // --- stats ---
  'stats.wins': 'WINS',
  'stats.losses': 'LOSSES',
  'stats.winRate': 'WIN RATE',
  'stats.matchHistory': 'MATCH HISTORY',
  'stats.noMatches': 'No matches played yet.',
  'stats.opponentLeft': 'opponent left',
  'stats.youLeft': 'you left',
  'stats.winShort': 'W',
  'stats.lossShort': 'L',
  'stats.vs': 'vs {name}',
  'stats.signInNote': 'Sign in to keep a record of every match you play.',
  'stats.error.loadFailed': 'Could not load your stats.',

  // --- daily challenges ---
  'daily.heading': 'DAILY CHALLENGES',
  'daily.signInNote': 'Sign in to save your rewards.',
  'daily.done': 'DONE',
  'daily.claimedAria': 'Claimed',
  'daily.claim': 'CLAIM',
  'daily.answer_15.title': 'SHARP SHOOTER',
  'daily.answer_15.desc': 'Answer {goal} questions correctly',
  'daily.score_5_pens.title': 'DEAD-EYE',
  'daily.score_5_pens.desc': 'Score {goal} penalties',
  'daily.win_1v1.title': 'DUELIST',
  'daily.win_1v1.desc': 'Win a 1v1 match',

  // --- daily login reward ---
  'dailyReward.title': 'DAILY REWARD',
  'dailyReward.aria': 'Daily login reward',
  'dailyReward.milestone': 'DAY {day}',
  'dailyReward.dayShort': 'D{day}',
  'dailyReward.claiming': 'CLAIMING…',
  'dailyReward.claim': 'CLAIM +{amount}',
  'dailyReward.claimed': 'Claimed! Come back tomorrow.',
  'dailyReward.welcomeBack': 'WELCOME BACK',
  'dailyReward.popupAria': 'Daily reward',

  // --- sound control ---
  'sound.showSlider': 'show volume slider',
  'sound.hideSlider': 'hide volume slider',
  'sound.masterVolume': 'master volume',
  'sound.mute': 'MUTE',
  'sound.unmute': 'UNMUTE',

  // --- social ---
  'social.twitterAria': 'Follow the developer on Twitter',
} satisfies Record<string, string>

export type MessageKey = keyof typeof en

/** Every locale must define every key — no partial catalogues, no runtime holes. */
export type Messages = Record<MessageKey, string>
