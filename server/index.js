import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { GLOBAL_ITEMS, HEROES } from './gameData.js'

const app = express()
const server = createServer(app)

const isAllowedOrigin = (origin) => {
  if (!origin) return true
  // Allow any origin for production
  return true
}

const io = new Server(server, {
  cors: {
    origin: (origin, cb) => cb(null, isAllowedOrigin(origin)),
    methods: ['GET', 'POST'],
  },
})

const PORT = process.env.PORT || 3010
const rooms = new Map()
const playerStats = new Map() // { socketId: { wins: 0, losses: 0, winStreak: 0, bestWinStreak: 0 } }
const ROOM_TTL_MS = 10 * 60 * 1000
const ITEMS_BY_ID = new Map(GLOBAL_ITEMS.map((it) => [it.id, it]))

setInterval(() => {
  const now = Date.now()
  for (const [code, room] of rooms.entries()) {
    if (room.players.size > 0) continue
    if (now - room.createdAt > ROOM_TTL_MS) {
      rooms.delete(code)
    }
  }
}, 60 * 1000)

app.use(cors({ origin: (origin, cb) => cb(null, isAllowedOrigin(origin)) }))
app.use(express.json())

// Serve client static files
import path from 'path'
import { fileURLToPath } from 'url'
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const clientDistPath = path.resolve(__dirname, '../client/dist')
app.use(express.static(clientDistPath))

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

function createRoomRecord() {
  return { players: new Map(), match: null, createdAt: Date.now() }
}

function getMemberCount(roomCode) {
  const room = rooms.get(roomCode)
  return room ? room.players.size : 0
}

function broadcastRoomState(roomCode) {
  const room = rooms.get(roomCode)
  if (!room) return
  // Map players to include team, ready state, etc.
  const players = [...room.players.entries()].map(([id, p]) => ({
    socketId: id,
    team: p.team,
    isReady: p.isReady,
  }))
  io.to(roomCode).emit('room-state', {
    roomCode,
    playerCount: room.players.size,
    maxPlayers: 4,
    players,
  })
}

function ensureUniqueRoomCode() {
  let roomCode = generateRoomCode()
  while (rooms.has(roomCode)) {
    roomCode = generateRoomCode()
  }
  return roomCode
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function getPlayerTeam(match, playerIndex) {
  const player = getPlayerByIndex(match, playerIndex)
  return player?.team
}

function getEnemyPlayerIndices(match, playerIndex) {
  const myTeam = getPlayerTeam(match, playerIndex)
  if (!myTeam) return []
  const enemies = match.players.filter(p => p.team !== myTeam && (p.hp || 0) > 0)
  return enemies.map(p => p.playerIndex)
}

function getOpponentIndex(playerIndex) {
  return playerIndex === 1 ? 2 : 1
}

function getPlayerByIndex(match, playerIndex) {
  return match?.players?.find((p) => p?.playerIndex === playerIndex) || null
}

function getHeroDefinition(heroId) {
  const key = heroId?.toString().trim().toLowerCase()
  return key ? HEROES[key] : null
}

function getPlayerIndexFromMatch(match, socketId) {
  if (!match || !Array.isArray(match.players)) return null
  const entry = match.players.find((p) => p?.socketId === socketId)
  return entry?.playerIndex ?? null
}

function applyHeal(player, amount) {
  const heal = Math.max(0, Math.floor(amount || 0))
  if (!heal) return { player, healed: 0 }
  const next = { ...player }
  const maxHp = Math.max(1, next.baseHP || 1)
  next.hp = clamp((next.hp || 0) + heal, 0, maxHp)
  return { player: next, healed: heal }
}

function getTurnCount(match) {
  return Math.max(1, Math.floor(match?.turnCount ?? match?.turn ?? 1))
}

function getTurnDamageMultiplier(match) {
  const turn = getTurnCount(match)
  if (turn >= 8) return 1.2
  if (turn >= 6) return 1.1
  return 1
}

function getActiveModifier(mod) {
  if (!mod || typeof mod !== 'object') return null
  const pct = typeof mod.pct === 'number' ? mod.pct : 0
  const turns = typeof mod.turns === 'number' ? mod.turns : 0
  if (turns <= 0 || pct === 0) return null
  return { pct, turns }
}

function getItemIdSet(player) {
  const ids = Array.isArray(player?.itemIds) ? player.itemIds : []
  return new Set(ids.map((v) => v?.toString()).filter(Boolean))
}

function getItemMods(player) {
  const ids = getItemIdSet(player)
  return {
    attackUpPct: ids.has('tsinelas_ni_nanay') ? 0.1 : 0,
    defenseUpPct: ids.has('anting_anting') ? 0.1 : 0,
    critChance: ids.has('lucky_3_coins') ? 0.15 : 0,
    critDamagePct: ids.has('lucky_3_coins') ? 0.35 : 0,
    healPerTurn: ids.has('fishball_power') ? 5 : 0,
    reduceRandomCooldownBy: ids.has('energy_drink') ? 1 : 0,
    flatDamageReduction: ids.has('jacket_ni_kuya') ? 6 : 0,
    stunChanceOnDamage: ids.has('old_nokia') ? 0.25 : 0,
    debuffMultiplier: ids.has('chismis_notebook') ? 1.25 : 1,
    randomBuffEachTurn: ids.has('pamahiin_charm'),
    ultimateDamageBonusPct: ids.has('final_blessing') ? 0.15 : 0,
  }
}

function applyTurnStartItems(player, events) {
  const mods = getItemMods(player)

  if (mods.healPerTurn > 0) {
    const healed = applyHeal(player, mods.healPerTurn)
    Object.assign(player, healed.player)
    if (healed.healed > 0) events.push({ kind: 'item-heal', itemId: 'fishball_power', amount: healed.healed, playerIndex: player.playerIndex })
  }

  if (mods.reduceRandomCooldownBy > 0) {
    const cd = Array.isArray(player.cooldowns) ? player.cooldowns : [0, 0, 0, 0]
    const indices = cd.map((v, i) => ({ v: Math.max(0, Math.floor(v || 0)), i })).filter((x) => x.v > 0)
    if (indices.length) {
      const pick = indices[Math.floor(Math.random() * indices.length)]
      cd[pick.i] = Math.max(0, cd[pick.i] - mods.reduceRandomCooldownBy)
      player.cooldowns = cd
      events.push({ kind: 'item-cooldown-reduce', itemId: 'energy_drink', slot: pick.i + 1, amount: mods.reduceRandomCooldownBy, playerIndex: player.playerIndex })
    }
  }

  if (mods.randomBuffEachTurn) {
    const roll = Math.floor(Math.random() * 4)
    if (roll === 0) {
      const healed = applyHeal(player, 6)
      Object.assign(player, healed.player)
      events.push({ kind: 'item-random', itemId: 'pamahiin_charm', rolled: 'heal', amount: healed.healed, playerIndex: player.playerIndex })
    } else if (roll === 1) {
      player.effects = player.effects && typeof player.effects === 'object' ? player.effects : {}
      player.effects.attack = { pct: 0.1, turns: 1 }
      events.push({ kind: 'item-random', itemId: 'pamahiin_charm', rolled: 'attack', pct: 0.1, turns: 1, playerIndex: player.playerIndex })
    } else if (roll === 2) {
      player.effects = player.effects && typeof player.effects === 'object' ? player.effects : {}
      player.effects.damageReduction = { pct: 0.1, turns: 1 }
      events.push({ kind: 'item-random', itemId: 'pamahiin_charm', rolled: 'defense', pct: 0.1, turns: 1, playerIndex: player.playerIndex })
    } else {
      player.effects = player.effects && typeof player.effects === 'object' ? player.effects : {}
      player.effects.evasion = { pct: 0.25, turns: 1 }
      events.push({ kind: 'item-random', itemId: 'pamahiin_charm', rolled: 'evasion', pct: 0.25, turns: 1, playerIndex: player.playerIndex })
    }
  }
}

function applyDamage(match, attackerIndex, targetIndex, rawAmount, context = {}) {
  const attacker = getPlayerByIndex(match, attackerIndex)
  const target = getPlayerByIndex(match, targetIndex)
  if (!attacker || !target) return { match, dealt: 0, evaded: false, reflected: 0, countered: 0, itemStunApplied: false, crit: false }

  const attackMod = getActiveModifier(attacker?.effects?.attack)
  const attackMultiplier = attackMod ? Math.max(0.1, 1 + attackMod.pct) : 1
  const attackerItemMods = getItemMods(attacker)
  const itemAttackMultiplier = 1 + attackerItemMods.attackUpPct
  const turnDamageMultiplier = getTurnDamageMultiplier(match)

  const ultimateBonus = context?.isUltimate ? attackerItemMods.ultimateDamageBonusPct : 0
  const ultimateMultiplier = 1 + ultimateBonus

  const critRoll = attackerItemMods.critChance > 0 && Math.random() < attackerItemMods.critChance
  const critMultiplier = critRoll ? 1 + attackerItemMods.critDamagePct : 1

  const modifiedAmount = Math.max(
    0,
    Math.floor((rawAmount || 0) * attackMultiplier * itemAttackMultiplier * ultimateMultiplier * critMultiplier * turnDamageMultiplier)
  )
  const amount = Math.max(0, Math.floor(modifiedAmount || 0))
  if (!amount) return { match, dealt: 0, evaded: false, reflected: 0, countered: 0, itemStunApplied: false, crit: critRoll }

  const immunityTurns = Math.max(0, Math.floor(target?.effects?.immunityTurns || 0))
  if (immunityTurns > 0) {
    return { match, dealt: 0, evaded: true, reflected: 0, countered: 0, itemStunApplied: false, crit: critRoll }
  }

  const targetEvasion = getActiveModifier(target?.effects?.evasion)
  const dodgeAllTurns = Math.max(0, Math.floor(target?.effects?.dodgeAllTurns || 0))
  if (dodgeAllTurns > 0) {
    return { match, dealt: 0, evaded: true, reflected: 0, countered: 0, itemStunApplied: false, crit: critRoll }
  }

  if (targetEvasion && Math.random() < targetEvasion.pct) {
    const nextMatch = { ...match, players: match.players.map((p) => ({ ...p })) }
    const nextTarget = getPlayerByIndex(nextMatch, targetIndex)
    nextTarget.effects = { ...(nextTarget.effects || {}), evasion: { ...nextTarget.effects.evasion, turns: 0 } }
    return { match: nextMatch, dealt: 0, evaded: true, reflected: 0, countered: 0, itemStunApplied: false, crit: critRoll }
  }

  const damageReduction = getActiveModifier(target?.effects?.damageReduction)
  const vulnerability = getActiveModifier(target?.effects?.vulnerability)
  const targetItemMods = getItemMods(target)

  const increased = vulnerability ? amount * (1 + vulnerability.pct) : amount
  const reducedA = damageReduction ? increased * (1 - damageReduction.pct) : increased
  const reducedB = targetItemMods.defenseUpPct ? reducedA * (1 - targetItemMods.defenseUpPct) : reducedA
  const reducedC = Math.max(0, Math.floor(reducedB) - Math.max(0, Math.floor(targetItemMods.flatDamageReduction || 0)))
  const finalDamage = Math.max(0, Math.floor(reducedC))

  const nextMatch = { ...match, players: match.players.map((p) => ({ ...p })) }
  const nextAttacker = getPlayerByIndex(nextMatch, attackerIndex)
  const nextTarget = getPlayerByIndex(nextMatch, targetIndex)

  const beforeShield = Math.max(0, Math.floor(nextTarget.shield || 0))
  const shieldAbsorb = Math.min(beforeShield, finalDamage)
  const afterShield = finalDamage - shieldAbsorb
  nextTarget.shield = beforeShield - shieldAbsorb

  const beforeHp = Math.max(0, Math.floor(nextTarget.hp || 0))
  nextTarget.hp = clamp(beforeHp - afterShield, 0, Math.max(1, nextTarget.baseHP || 1))

  let reflected = 0
  const reflect = getActiveModifier(nextTarget?.effects?.reflect)
  if (reflect && finalDamage > 0) {
    reflected = Math.max(0, Math.floor(finalDamage * reflect.pct))
    if (reflected > 0) {
      const aBeforeHp = Math.max(0, Math.floor(nextAttacker.hp || 0))
      nextAttacker.hp = clamp(aBeforeHp - reflected, 0, Math.max(1, nextAttacker.baseHP || 1))
    }
  }

  let countered = 0
  const counter = nextTarget?.effects?.counter
  if (counter && typeof counter.damage === 'number' && (counter.turns || 0) > 0) {
    countered = Math.max(0, Math.floor(counter.damage))
    if (countered > 0) {
      const aBeforeHp = Math.max(0, Math.floor(nextAttacker.hp || 0))
      nextAttacker.hp = clamp(aBeforeHp - countered, 0, Math.max(1, nextAttacker.baseHP || 1))
    }
  }

  let itemStunApplied = false
  const itemStunChance = Math.max(0, Math.min(1, attackerItemMods.stunChanceOnDamage || 0))
  const skillStunChance = Math.max(0, Math.min(1, Number(nextAttacker?.effects?.stunChancePct || 0)))
  const totalStunChance = Math.min(1, itemStunChance + skillStunChance)
  if (finalDamage > 0 && totalStunChance > 0) {
    if (Math.random() < totalStunChance) {
      nextTarget.effects = nextTarget.effects && typeof nextTarget.effects === 'object' ? nextTarget.effects : {}
      nextTarget.effects.stunTurns = Math.max(0, Math.floor(nextTarget.effects.stunTurns || 0))
      nextTarget.effects.stunTurns = Math.max(nextTarget.effects.stunTurns, 1)
      itemStunApplied = true
    }
  }

  return { match: nextMatch, dealt: finalDamage, evaded: false, reflected, countered, itemStunApplied, crit: critRoll }
}

function startTurnTick(match, currentPlayerIndex) {
  const nextMatch = { ...match, players: match.players.map((p) => ({ ...p })) }
  const player = getPlayerByIndex(nextMatch, currentPlayerIndex)
  if (!player) return { match: nextMatch, events: [] }

  const events = []
  const cooldowns = Array.isArray(player.cooldowns) ? player.cooldowns : [0, 0, 0, 0]
  player.cooldowns = cooldowns.map((v) => Math.max(0, Math.floor(v || 0) - 1))

  applyTurnStartItems(player, events)

  const effects = player.effects && typeof player.effects === 'object' ? { ...player.effects } : {}

  const dots = Array.isArray(effects.dot) ? effects.dot.map((d) => ({ ...d })) : []
  const nextDots = []
  for (const dot of dots) {
    const dmg = Math.max(0, Math.floor(dot.damage || 0))
    const turns = Math.max(0, Math.floor(dot.turns || 0))
    if (turns <= 0) continue
    if (dmg > 0) {
      player.hp = clamp((player.hp || 0) - dmg, 0, Math.max(1, player.baseHP || 1))
      events.push({ kind: 'dot', playerIndex: currentPlayerIndex, amount: dmg })
    }
    if (turns - 1 > 0) nextDots.push({ ...dot, turns: turns - 1 })
  }
  effects.dot = nextDots

  const hots = Array.isArray(effects.hot) ? effects.hot.map((h) => ({ ...h })) : []
  const nextHots = []
  for (const hot of hots) {
    const heal = Math.max(0, Math.floor(hot.heal || 0))
    const turns = Math.max(0, Math.floor(hot.turns || 0))
    if (turns <= 0) continue
    if (heal > 0) {
      player.hp = clamp((player.hp || 0) + heal, 0, Math.max(1, player.baseHP || 1))
      events.push({ kind: 'hot', playerIndex: currentPlayerIndex, amount: heal })
    }
    if (turns - 1 > 0) nextHots.push({ ...hot, turns: turns - 1 })
  }
  effects.hot = nextHots

  const timedKeys = ['damageReduction', 'vulnerability', 'reflect', 'evasion', 'counter', 'attack']
  for (const key of timedKeys) {
    const val = effects[key]
    if (!val || typeof val !== 'object') continue
    const turns = Math.max(0, Math.floor(val.turns || 0))
    if (turns - 1 > 0) effects[key] = { ...val, turns: turns - 1 }
    else delete effects[key]
  }

  const dodgeAllTurns = Math.max(0, Math.floor(effects.dodgeAllTurns || 0))
  effects.dodgeAllTurns = dodgeAllTurns > 0 ? dodgeAllTurns - 1 : 0

  const immunityTurns = Math.max(0, Math.floor(effects.immunityTurns || 0))
  effects.immunityTurns = immunityTurns > 0 ? immunityTurns - 1 : 0

  // Stun chance from skill effects (e.g. Tara GYM!)
  const stunChancePctTurns = Math.max(0, Math.floor(effects.stunChancePctTurns || 0))
  if (stunChancePctTurns > 0) {
    effects.stunChancePctTurns = stunChancePctTurns - 1
    if (effects.stunChancePctTurns <= 0) {
      delete effects.stunChancePctTurns
      delete effects.stunChancePct
    }
  }

  // NOTE: stunTurns is intentionally NOT decremented here.
  // advanceTurn checks stunTurns AFTER startTurnTick runs and decrements it there
  // when it actually skips the player's turn. Decrementing here would zero it out
  // before the skip-check can see it, breaking the Old Nokia stun mid-battle.
  effects.stunTurns = Math.max(0, Math.floor(effects.stunTurns || 0))

  // Handle extra turn chance
  let extraTurnThisTurn = false
  const extraTurnChanceTurns = Math.max(0, Math.floor(effects.extraTurnChanceTurns || 0))
  const extraTurnChancePct = Math.max(0, Math.min(1, Number(effects.extraTurnChancePct || 0)))
  if (extraTurnChanceTurns > 0) {
    if (extraTurnChancePct > 0 && Math.random() < extraTurnChancePct) {
      extraTurnThisTurn = true
      effects.extraTurnsRemaining = (effects.extraTurnsRemaining || 0) + 1
    }
    if (extraTurnChanceTurns - 1 > 0) {
      effects.extraTurnChanceTurns = extraTurnChanceTurns - 1
    } else {
      delete effects.extraTurnChanceTurns
      delete effects.extraTurnChancePct
    }
  }

  player.effects = effects
  return { match: nextMatch, events, extraTurnThisTurn }
}

function isMatchOver(match) {
  const players = match.players || []
  if (players.length < 2) return false
  
  const team1Players = players.filter(p => p.team === 1)
  const team2Players = players.filter(p => p.team === 2)
  
  const team1Alive = team1Players.some(p => (p.hp || 0) > 0)
  const team2Alive = team2Players.some(p => (p.hp || 0) > 0)
  
  return !team1Alive || !team2Alive
}

function isTurnLimitReached(match) {
  return getTurnCount(match) >= 15
}

function finalizeWinner(match) {
  const players = match.players || []
  if (players.length < 2) return match
  
  const team1Players = players.filter(p => p.team === 1)
  const team2Players = players.filter(p => p.team === 2)
  
  const team1Alive = team1Players.some(p => (p.hp || 0) > 0)
  const team2Alive = team2Players.some(p => (p.hp || 0) > 0)
  
  if (!team1Alive && !team2Alive) {
    return { ...match, endedAt: Date.now(), result: { kind: 'draw', reason: 'hp_zero' } }
  }
  
  const winningTeam = team1Alive ? 1 : 2
  const anyWinner = players.find(p => p.team === winningTeam && (p.hp || 0) > 0)
  
  return { 
    ...match, 
    endedAt: Date.now(), 
    result: { 
      kind: 'win', 
      winnerPlayerIndex: anyWinner?.playerIndex,
      winningTeam,
      reason: 'hp_zero' 
    } 
  }
}

function finalizeByTurnLimit(match) {
  const players = match.players || []
  if (players.length < 2) return match
  
  const team1Players = players.filter(p => p.team === 1)
  const team2Players = players.filter(p => p.team === 2)
  
  const team1TotalHp = team1Players.reduce((sum, p) => sum + Math.max(0, Math.floor(p.hp || 0)), 0)
  const team2TotalHp = team2Players.reduce((sum, p) => sum + Math.max(0, Math.floor(p.hp || 0)), 0)
  
  if (team1TotalHp === team2TotalHp) {
    return { ...match, endedAt: Date.now(), result: { kind: 'draw', reason: 'turn_limit' } }
  }
  
  const winningTeam = team1TotalHp > team2TotalHp ? 1 : 2
  const anyWinner = players.find(p => p.team === winningTeam && (p.hp || 0) > 0)
  
  return {
    ...match,
    endedAt: Date.now(),
    result: { 
      kind: 'win', 
      winnerPlayerIndex: anyWinner?.playerIndex,
      winningTeam,
      reason: 'turn_limit' 
    },
  }
}

function maybeFinalizeMatch(match) {
  if (!match || match.endedAt) return match
  if (isMatchOver(match)) return finalizeWinner(match)
  return match
}

function advanceTurn(match) {
  const currentTurnPlayerIndex = match.currentTurnPlayerIndex ?? match.activePlayerIndex
  const currentPlayer = getPlayerByIndex(match, currentTurnPlayerIndex)
  
  // Check if current player has extra turns left
  if (currentPlayer?.effects?.extraTurnsRemaining > 0) {
    // Use one extra turn
    let nextMatch = {
      ...match,
      turnCount: (match.turnCount ?? match.turn ?? 1) + 1,
      lastTurnEndedAt: Date.now(),
      lastTurnEndedBy: currentTurnPlayerIndex,
    }
    // Update player to use extra turn
    const nextPlayers = nextMatch.players.map(p => {
      if (p.playerIndex === currentTurnPlayerIndex) {
        return {
          ...p,
          effects: {
            ...p.effects,
            extraTurnsRemaining: Math.max(0, p.effects.extraTurnsRemaining - 1)
          }
        }
      }
      return p
    })
    nextMatch.players = nextPlayers
    
    // Start the extra turn
    const tick = startTurnTick(nextMatch, currentTurnPlayerIndex)
    nextMatch = tick.match
    
    const events = [...tick.events]
    if (tick.extraTurnThisTurn) {
      events.push({ kind: 'extra-turn', playerIndex: currentTurnPlayerIndex })
    }
    
    // Check stunned
    const stillCurrentPlayer = getPlayerByIndex(nextMatch, currentTurnPlayerIndex)
    const stunned = Math.max(0, Math.floor(stillCurrentPlayer?.effects?.stunTurns || 0))
    if (stunned > 0) {
      // Consume one stun turn now that we've confirmed the skip
      stillCurrentPlayer.effects.stunTurns = stunned - 1
      const skip = advanceTurn(nextMatch)
      return { match: skip.match, events: [...events, { kind: 'stun-skip', playerIndex: currentTurnPlayerIndex }, ...skip.events] }
    }
    
    return { match: nextMatch, events }
  }
  
  // No extra turns: proceed to next player
  const players = match.players || []
  const playerIndices = players.map(p => p.playerIndex).sort((a, b) => a - b)
  
  const currentIdx = playerIndices.indexOf(currentTurnPlayerIndex)
  const nextIdx = (currentIdx + 1) % playerIndices.length
  const nextPlayerIndex = playerIndices[nextIdx]
  
  const nextTurnCount = (match.turnCount ?? match.turn ?? 1) + 1

  let nextMatch = {
    ...match,
    turnCount: nextTurnCount,
    currentTurnPlayerIndex: nextPlayerIndex,
    turn: nextTurnCount,
    activePlayerIndex: nextPlayerIndex,
    lastTurnEndedAt: Date.now(),
    lastTurnEndedBy: currentTurnPlayerIndex,
  }

  const tick = startTurnTick(nextMatch, nextPlayerIndex)
  nextMatch = tick.match
  
  const events = [...tick.events]
  if (tick.extraTurnThisTurn) {
    events.push({ kind: 'extra-turn', playerIndex: nextPlayerIndex })
  }

  const current = getPlayerByIndex(nextMatch, nextPlayerIndex)
  const stunned = Math.max(0, Math.floor(current?.effects?.stunTurns || 0))
  if (stunned > 0) {
    // Consume one stun turn now that we've confirmed the skip
    current.effects.stunTurns = stunned - 1
    const skip = advanceTurn(nextMatch)
    return { match: skip.match, events: [...events, { kind: 'stun-skip', playerIndex: nextPlayerIndex }, ...skip.events] }
  }

  return { match: nextMatch, events }
}

function createMatchFromPlayerDescriptors(roomCode, descriptors) {
  const players = descriptors
    .map((d) => {
      const hero = getHeroDefinition(d.heroId)
      if (!hero) return null
      return {
        playerIndex: d.playerIndex,
        socketId: d.socketId,
        team: d.team,
        heroId: d.heroId,
        heroName: hero.name,
        baseHP: hero.baseHP,
        hp: hero.baseHP,
        itemIds: Array.isArray(d.itemIds) ? d.itemIds : [],
        shield: 0,
        cooldowns: [0, 0, 0, 0],
        effects: { dot: [], hot: [], dodgeAllTurns: 0, stunTurns: 0, immunityTurns: 0, extraTurnsRemaining: 0, extraTurnChanceTurns: 0, extraTurnChancePct: 0 },
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.playerIndex - b.playerIndex)

  if (players.length < 2) return null

  const startingPlayerIndex = 1
  let matchState = {
    roomCode,
    startedAt: Date.now(),
    turnCount: 1,
    currentTurnPlayerIndex: startingPlayerIndex,
    turn: 1,
    activePlayerIndex: startingPlayerIndex,
    players,
  }

  const firstTick = startTurnTick(matchState, startingPlayerIndex)
  matchState = { ...firstTick.match, lastTurnStartEvents: firstTick.events }
  return matchState
}

function leaveCurrentRoom(socket) {
  const code = socket.data.roomCode
  if (!code || !rooms.has(code)) {
    socket.data.roomCode = undefined
    return
  }

  const room = rooms.get(code)
  room.players.delete(socket.id)
  if (socket.connected) {
    socket.leave(code)
  }
  socket.data.roomCode = undefined

  socket.to(code).emit('player-left', { roomCode: code })
  broadcastRoomState(code)

  if (room.match) {
    room.match = null
    for (const [id, player] of room.players.entries()) {
      room.players.set(id, { ...player, isReady: false, readyAt: undefined })
    }
    io.to(code).emit('match-cancelled', { roomCode: code, reason: 'player_left' })
    io.to(code).emit('player-ready-state', { roomCode: code, readyCount: 0, playerCount: room.players.size })
  }

  if (room.players.size === 0) {
    rooms.delete(code)
  }
}

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.post('/api/rooms', (_req, res) => {
  const roomCode = ensureUniqueRoomCode()
  rooms.set(roomCode, createRoomRecord())
  res.status(201).json({ roomCode })
})

app.get('/api/rooms/:code', (req, res) => {
  const roomCode = req.params.code.toUpperCase()
  if (!rooms.has(roomCode)) {
    return res.status(404).json({ error: 'Room not found' })
  }
  const room = rooms.get(roomCode)
  return res.json({
    roomCode,
    playerCount: room.players.size,
    maxPlayers: 4,
  })
})

app.get('/api/game-data', (_req, res) => {
  res.json({ heroes: HEROES, items: GLOBAL_ITEMS })
})

// Catch-all route for client-side routing
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDistPath, 'index.html'))
})

io.on('connection', (socket) => {
  socket.emit('socket-ready', { id: socket.id })

  socket.on('create-room', () => {
    leaveCurrentRoom(socket)

    const roomCode = ensureUniqueRoomCode()
    const room = createRoomRecord()
    rooms.set(roomCode, room)

    socket.join(roomCode)
    socket.data.roomCode = roomCode
    // Assign new player to team with fewer players (default to team 1
    const team1Count = [...room.players.values()].filter(p => p.team === 1).length
    const team2Count = [...room.players.values()].filter(p => p.team === 2).length
    const newTeam = team1Count <= team2Count ? 1 : 2
    room.players.set(socket.id, { joinedAt: Date.now(), setup: null, isReady: false, readyAt: undefined, team: newTeam })

    socket.emit('room-created', { roomCode, playerCount: 1, maxPlayers: 4 })
    broadcastRoomState(roomCode)
  })

  socket.on('join-room', ({ roomCode } = {}) => {
    leaveCurrentRoom(socket)

    const code = roomCode?.toString().trim().toUpperCase()
    if (!code || !rooms.has(code)) {
      socket.emit('room-error', { error: 'Room not found' })
      return
    }

    const room = rooms.get(code)
    if (room.players.size >= 4) {
      socket.emit('room-error', { error: 'Room is full' })
      return
    }

    socket.join(code)
    socket.data.roomCode = code
    // Assign new player to team with fewer players
    const team1Count = [...room.players.values()].filter(p => p.team === 1).length
    const team2Count = [...room.players.values()].filter(p => p.team === 2).length
    const newTeam = team1Count <= team2Count ? 1 : 2
    room.players.set(socket.id, { joinedAt: Date.now(), setup: null, isReady: false, readyAt: undefined, team: newTeam })

    socket.emit('room-joined', { roomCode: code, playerCount: room.players.size, maxPlayers: 4 })
    socket.to(code).emit('player-joined', { roomCode: code })

    broadcastRoomState(code)
    
    // Send current match state if it exists
    if (room.match) {
      socket.emit('match-started', room.match)
    }
    
    // Send player ready state if applicable
    const readyCount = [...room.players.values()].filter((p) => p.isReady).length
    socket.emit('player-ready-state', { roomCode: code, readyCount, playerCount: room.players.size })

    if (room.players.size === 2 || room.players.size === 4) {
      io.to(code).emit('room-ready', { roomCode: code })
    }
  })

  socket.on('switch-team', () => {
    const code = socket.data.roomCode
    if (!code || !rooms.has(code)) {
      socket.emit('room-error', { error: 'Not in a room' })
      return
    }

    const room = rooms.get(code)
    const player = room.players.get(socket.id)
    if (!player) {
      socket.emit('room-error', { error: 'Player not registered in room' })
      return
    }

    if (player.isReady || room.match) {
      socket.emit('room-error', { error: 'Can\'t switch teams while ready or in match' })
      return
    }

    // Check if other team still has room
    const newTeam = player.team === 1 ? 2 : 1
    const otherTeamCount = [...room.players.values()].filter(p => p.team === newTeam).length
    if (otherTeamCount >= 2) {
      socket.emit('room-error', { error: 'Other team is full' })
      return
    }

    room.players.set(socket.id, { ...player, team: newTeam })
    broadcastRoomState(code)
  })

  socket.on('leave-room', () => {
    leaveCurrentRoom(socket)
  })

  socket.on('player-ready', ({ heroId, itemIds } = {}) => {
    const code = socket.data.roomCode
    if (!code || !rooms.has(code)) {
      socket.emit('room-error', { error: 'Not in a room' })
      return
    }

    const heroKey = heroId?.toString().trim().toLowerCase()
    if (!heroKey || !HEROES[heroKey]) {
      socket.emit('room-error', { error: 'Invalid hero' })
      return
    }

    const rawItems = Array.isArray(itemIds) ? itemIds : []
    const cleanItemIds = [...new Set(rawItems.map((v) => v?.toString()).filter(Boolean))]
    if (cleanItemIds.length > 3) {
      socket.emit('room-error', { error: 'You can select up to 3 items' })
      return
    }
    if (cleanItemIds.length !== 3) {
      socket.emit('room-error', { error: 'Select exactly 3 items' })
      return
    }

    const itemsById = new Set(GLOBAL_ITEMS.map((i) => i.id))
    const invalidItem = cleanItemIds.find((id) => !itemsById.has(id))
    if (invalidItem) {
      socket.emit('room-error', { error: 'Invalid item selection' })
      return
    }

    const room = rooms.get(code)
    const player = room.players.get(socket.id)
    if (!player) {
      socket.emit('room-error', { error: 'Player not registered in room' })
      return
    }

    const setup = {
      heroId: heroKey,
      itemIds: cleanItemIds,
    }

    room.players.set(socket.id, { ...player, setup, isReady: true, readyAt: Date.now() })

    socket.emit('player-ready-saved', { roomCode: code, setup })

    const readyCount = [...room.players.values()].filter((p) => p.isReady).length
    io.to(code).emit('player-ready-state', { roomCode: code, readyCount, playerCount: room.players.size })
    broadcastRoomState(code)

    // Check for 1v1 (2 players, 1 per team, all ready) OR 2v2 (4 players, 2 per team, all ready)
    const team1Players = [...room.players.values()].filter(p => p.team === 1)
    const team2Players = [...room.players.values()].filter(p => p.team === 2)
    const allPlayersReady = [...room.players.values()].every(p => p.isReady)
    const is1v1Ready = team1Players.length === 1 && team2Players.length === 1 && allPlayersReady
    const is2v2Ready = team1Players.length === 2 && team2Players.length === 2 && allPlayersReady
    const allReady = is1v1Ready || is2v2Ready
    if (!allReady || room.match) return

    // Create match
    const playerEntries = [...room.players.entries()].sort((a, b) => (a[1].joinedAt || 0) - (b[1].joinedAt || 0))
    const descriptors = playerEntries.map(([id, p], index) => ({
      playerIndex: index + 1,
      socketId: id,
      heroId: p.setup.heroId,
      itemIds: p.setup.itemIds,
      team: p.team,
    }))
    const matchState = createMatchFromPlayerDescriptors(code, descriptors)
    if (!matchState) {
      socket.emit('room-error', { error: 'Failed to start match' })
      return
    }

    room.match = matchState
    io.to(code).emit('match-started', matchState)
  })

  socket.on('cancel-ready', () => {
    const code = socket.data.roomCode
    if (!code || !rooms.has(code)) {
      socket.emit('room-error', { error: 'Not in a room' })
      return
    }

    const room = rooms.get(code)
    if (room.match) {
      socket.emit('room-error', { error: 'Cannot cancel ready after match has started' })
      return
    }

    const player = room.players.get(socket.id)
    if (!player) {
      socket.emit('room-error', { error: 'Player not registered in room' })
      return
    }

    room.players.set(socket.id, { ...player, isReady: false, readyAt: undefined })

    socket.emit('player-ready-cancelled', { roomCode: code })

    const readyCount = [...room.players.values()].filter((p) => p.isReady).length
    io.to(code).emit('player-ready-state', { roomCode: code, readyCount, playerCount: room.players.size })
    broadcastRoomState(code)
  })

  socket.on('play-again', () => {
    const code = socket.data.roomCode
    if (!code || !rooms.has(code)) {
      socket.emit('room-error', { error: 'Not in a room' })
      return
    }

    const room = rooms.get(code)
    if (!room.match || !room.match.endedAt) {
      socket.emit('room-error', { error: 'No completed match to restart' })
      return
    }

    // Check for valid teams (same as before)
    const team1Players = [...room.players.values()].filter(p => p.team === 1)
    const team2Players = [...room.players.values()].filter(p => p.team === 2)
    const is1v1Valid = team1Players.length === 1 && team2Players.length === 1
    const is2v2Valid = team1Players.length === 2 && team2Players.length === 2
    if (!is1v1Valid && !is2v2Valid) {
      socket.emit('room-error', { error: 'Need valid teams to play again' })
      return
    }

    // Create new match with same setup
    const playerEntries = [...room.players.entries()].sort((a, b) => (a[1].joinedAt || 0) - (b[1].joinedAt || 0))
    const descriptors = playerEntries.map(([id, p], index) => ({
      playerIndex: index + 1,
      socketId: id,
      heroId: p.setup.heroId,
      itemIds: p.setup.itemIds,
      team: p.team,
    }))
    const matchState = createMatchFromPlayerDescriptors(code, descriptors)
    if (!matchState) {
      socket.emit('room-error', { error: 'Failed to start match' })
      return
    }

    room.match = matchState
    io.to(code).emit('match-started', matchState)
  })

  socket.on('go-back-to-setup', () => {
    const code = socket.data.roomCode
    if (!code || !rooms.has(code)) {
      socket.emit('room-error', { error: 'Not in a room' })
      return
    }

    const room = rooms.get(code)
    // Reset match and all players' ready states
    room.match = null
    for (const [id, player] of room.players.entries()) {
      room.players.set(id, {
        ...player,
        isReady: false,
        readyAt: undefined,
      })
    }

    // Notify all players in the room to go back to setup
    io.to(code).emit('play-again-init')
  })

  socket.on('player-action', ({ kind, skillIndex, targetPlayerIndex } = {}) => {
    const code = socket.data.roomCode
    if (!code || !rooms.has(code)) {
      socket.emit('room-error', { error: 'Not in a room' })
      return
    }

    const room = rooms.get(code)
    if (!room.match) {
      socket.emit('room-error', { error: 'No active match' })
      return
    }

    if (room.match?.endedAt) {
      socket.emit('room-error', { error: 'Match is over' })
      return
    }

    if (room.match?.actionLock) {
      socket.emit('room-error', { error: 'Action in progress' })
      return
    }

    const match = room.match
    const playerIndex = getPlayerIndexFromMatch(match, socket.id)
    if (!playerIndex) {
      socket.emit('room-error', { error: 'Player not registered in match' })
      return
    }

    const currentTurnPlayerIndex = match.currentTurnPlayerIndex ?? match.activePlayerIndex
    if (playerIndex !== currentTurnPlayerIndex) {
      socket.emit('room-error', { error: 'Not your turn' })
      return
    }

    const actor = getPlayerByIndex(match, playerIndex)
    if (!actor) {
      socket.emit('room-error', { error: 'Actor missing' })
      return
    }

    const stunned = Math.max(0, Math.floor(actor?.effects?.stunTurns || 0))
    if (stunned > 0) {
      socket.emit('room-error', { error: 'You are stunned' })
      return
    }

    const hero = getHeroDefinition(actor.heroId)
    if (!hero) {
      socket.emit('room-error', { error: 'Hero not found' })
      return
    }

    const nextMatchBase = { ...match, actionLock: true }
    room.match = nextMatchBase

    let nextMatch = JSON.parse(JSON.stringify(nextMatchBase))
    const log = []

    let targetIndex
    const enemyIndices = getEnemyPlayerIndices(match, playerIndex)
    if (targetPlayerIndex && enemyIndices.includes(targetPlayerIndex)) {
      targetIndex = targetPlayerIndex
    } else {
      // Fall back to first alive enemy
      targetIndex = enemyIndices[0]
    }
    const enemyIndex = targetIndex || getOpponentIndex(playerIndex)

    if (kind === 'normal') {
      const effect = hero.normalAttack?.effect
      if (!effect) {
        socket.emit('room-error', { error: 'Normal attack missing' })
        room.match = { ...match, actionLock: false }
        return
      }

      if (effect.kind === 'damage') {
        const hits = Math.max(1, Math.floor(effect.hits || 1))
        const perHit = Math.max(0, Math.floor(effect.amount || 0))
        let totalDealt = 0
        let totalReflected = 0
        let totalCountered = 0
        let evaded = false
        let itemStunApplied = false
        for (let i = 0; i < hits; i += 1) {
          const result = applyDamage(nextMatch, playerIndex, enemyIndex, perHit)
          nextMatch = result.match
          totalDealt += result.dealt
          totalReflected += result.reflected
          totalCountered += result.countered
          evaded = evaded || result.evaded
          itemStunApplied = itemStunApplied || result.itemStunApplied
        }
        log.push({
          kind: 'normal',
          actorPlayerIndex: playerIndex,
          targetPlayerIndex: enemyIndex,
          name: hero.normalAttack?.name || 'Normal Attack',
          dealt: totalDealt,
          evaded,
          reflected: totalReflected,
          countered: totalCountered,
          itemStunApplied,
        })
      }
    } else if (kind === 'skill') {
      const index = Math.max(0, Math.min(3, Math.floor(skillIndex || 0)))
      const skill = hero.skills?.[index]
      if (!skill) {
        socket.emit('room-error', { error: 'Skill not found' })
        room.match = { ...match, actionLock: false }
        return
      }
      const isUltimate = skill.type === 'ultimate'

      const actorNext = getPlayerByIndex(nextMatch, playerIndex)
      actorNext.cooldowns = Array.isArray(actorNext.cooldowns) ? actorNext.cooldowns : [0, 0, 0, 0]
      if ((actorNext.cooldowns[index] || 0) > 0) {
        socket.emit('room-error', { error: 'Skill on cooldown' })
        room.match = { ...match, actionLock: false }
        return
      }

      // minTurn lock — skill cannot be used before a certain turn
      if (typeof skill.minTurn === 'number' && getTurnCount(match) < skill.minTurn) {
        socket.emit('room-error', { error: `"${skill.name}" unlocks at Turn ${skill.minTurn}. Current turn: ${getTurnCount(match)}.` })
        room.match = { ...match, actionLock: false }
        return
      }

      const effect = skill.effect
      const effectKind = effect?.kind
      if (!effectKind) {
        socket.emit('room-error', { error: 'Skill effect missing' })
        room.match = { ...match, actionLock: false }
        return
      }

      if (typeof skill.cooldown === 'number' && skill.cooldown > 0) {
        actorNext.cooldowns[index] = Math.max(0, Math.floor(skill.cooldown))
      }

      const ensureEffects = (p) => {
        p.effects = p.effects && typeof p.effects === 'object' ? p.effects : { dot: [], hot: [], dodgeAllTurns: 0, stunTurns: 0, extraTurnsRemaining: 0, extraTurnChanceTurns: 0, extraTurnChancePct: 0 }
        p.effects.dot = Array.isArray(p.effects.dot) ? p.effects.dot : []
        p.effects.hot = Array.isArray(p.effects.hot) ? p.effects.hot : []
        p.effects.dodgeAllTurns = Math.max(0, Math.floor(p.effects.dodgeAllTurns || 0))
        p.effects.stunTurns = Math.max(0, Math.floor(p.effects.stunTurns || 0))
        p.effects.extraTurnsRemaining = Math.max(0, Math.floor(p.effects.extraTurnsRemaining || 0))
        p.effects.extraTurnChanceTurns = Math.max(0, Math.floor(p.effects.extraTurnChanceTurns || 0))
        p.effects.extraTurnChancePct = Math.max(0, Math.min(1, Number(p.effects.extraTurnChancePct || 0)))
      }

      const targetEnemy = getPlayerByIndex(nextMatch, enemyIndex)
      ensureEffects(actorNext)
      ensureEffects(targetEnemy)

      if (effectKind === 'damage') {
        const dmg = Math.max(0, Math.floor(effect.amount || 0))
        const result = applyDamage(nextMatch, playerIndex, enemyIndex, dmg, { isUltimate })
        nextMatch = result.match
        log.push({
          kind: 'skill',
          actorPlayerIndex: playerIndex,
          targetPlayerIndex: enemyIndex,
          slot: index + 1,
          name: skill.name,
          dealt: result.dealt,
          evaded: result.evaded,
          reflected: result.reflected,
          countered: result.countered,
          crit: result.crit,
          itemStunApplied: result.itemStunApplied,
        })
      } else if (effectKind === 'shield') {
        const shield = Math.max(0, Math.floor(effect.shield || 0))
        const actorAfter = getPlayerByIndex(nextMatch, playerIndex)
        actorAfter.shield = Math.max(0, Math.floor(actorAfter.shield || 0)) + shield
        log.push({
          kind: 'skill',
          actorPlayerIndex: playerIndex,
          targetPlayerIndex: playerIndex,
          slot: index + 1,
          name: skill.name,
          gainedShield: shield,
        })
      } else if (effectKind === 'immunity') {
        const turns = Math.max(1, Math.floor(effect.turns || 1))
        actorNext.effects.immunityTurns = Math.max(actorNext.effects.immunityTurns || 0, turns)
        log.push({
          kind: 'skill',
          actorPlayerIndex: playerIndex,
          targetPlayerIndex: playerIndex,
          slot: index + 1,
          name: skill.name,
          applied: { kind: 'immunity', turns },
        })
      } else if (effectKind === 'damage_and_heal') {
        const dmg = Math.max(0, Math.floor(effect.damage || 0))
        const healSelf = Math.max(0, Math.floor(effect.healSelf || 0))
        const result = applyDamage(nextMatch, playerIndex, enemyIndex, dmg, { isUltimate })
        nextMatch = result.match
        const actorAfter = getPlayerByIndex(nextMatch, playerIndex)
        const healed = applyHeal(actorAfter, healSelf)
        Object.assign(actorAfter, healed.player)
        log.push({
          kind: 'skill',
          actorPlayerIndex: playerIndex,
          targetPlayerIndex: enemyIndex,
          slot: index + 1,
          name: skill.name,
          dealt: result.dealt,
          evaded: result.evaded,
          reflected: result.reflected,
          countered: result.countered,
          crit: result.crit,
          itemStunApplied: result.itemStunApplied,
          healedSelf: healed.healed,
        })
      } else if (effectKind === 'damage_and_stun') {
        const dmg = Math.max(0, Math.floor(effect.damage || 0))
        const stunTurns = Math.max(1, Math.floor(effect.stunTurns || 1))
        const result = applyDamage(nextMatch, playerIndex, enemyIndex, dmg, { isUltimate })
        nextMatch = result.match
        const enemyAfter = getPlayerByIndex(nextMatch, enemyIndex)
        ensureEffects(enemyAfter)
        enemyAfter.effects.stunTurns = Math.max(enemyAfter.effects.stunTurns || 0, stunTurns)
        log.push({
          kind: 'skill',
          actorPlayerIndex: playerIndex,
          targetPlayerIndex: enemyIndex,
          slot: index + 1,
          name: skill.name,
          dealt: result.dealt,
          evaded: result.evaded,
          reflected: result.reflected,
          countered: result.countered,
          crit: result.crit,
          itemStunApplied: result.itemStunApplied,
          applied: { kind: 'stun', turns: stunTurns },
        })
      } else if (effectKind === 'damage_with_miss') {
        const dmg = Math.max(0, Math.floor(effect.damage || 0))
        const missChance = Math.max(0, Math.min(1, Number(effect.missChance || 0)))
        const missed = missChance > 0 && Math.random() < missChance
        if (missed) {
          log.push({
            kind: 'skill',
            actorPlayerIndex: playerIndex,
            targetPlayerIndex: enemyIndex,
            slot: index + 1,
            name: skill.name,
            dealt: 0,
            evaded: true,
            missed: true,
          })
        } else {
          const result = applyDamage(nextMatch, playerIndex, enemyIndex, dmg, { isUltimate })
          nextMatch = result.match
          log.push({
            kind: 'skill',
            actorPlayerIndex: playerIndex,
            targetPlayerIndex: enemyIndex,
            slot: index + 1,
            name: skill.name,
            dealt: result.dealt,
            evaded: result.evaded,
            reflected: result.reflected,
            countered: result.countered,
            missed: false,
            crit: result.crit,
            itemStunApplied: result.itemStunApplied,
          })
        }
      } else if (effectKind === 'damage_and_attack_down') {
        const dmg = Math.max(0, Math.floor(effect.damage || 0))
        const mult = getItemMods(actorNext).debuffMultiplier
        const pct = Math.max(0, Math.min(0.6, Number(effect.attackDownPct || 0) * mult))
        const turns = Math.max(1, Math.floor(effect.turns || 1))
        const result = applyDamage(nextMatch, playerIndex, enemyIndex, dmg, { isUltimate })
        nextMatch = result.match
        const enemyAfter = getPlayerByIndex(nextMatch, enemyIndex)
        ensureEffects(enemyAfter)
        enemyAfter.effects.attack = { pct: -pct, turns }
        log.push({
          kind: 'skill',
          actorPlayerIndex: playerIndex,
          targetPlayerIndex: enemyIndex,
          slot: index + 1,
          name: skill.name,
          dealt: result.dealt,
          evaded: result.evaded,
          reflected: result.reflected,
          countered: result.countered,
          crit: result.crit,
          itemStunApplied: result.itemStunApplied,
          applied: { kind: 'attack', pct: -pct, turns },
        })
      } else if (effectKind === 'attack_down_and_heal') {
        const mult = getItemMods(actorNext).debuffMultiplier
        const pct = Math.max(0, Math.min(0.6, Number(effect.attackDownPct || 0) * mult))
        const turns = Math.max(1, Math.floor(effect.turns || 1))
        const healSelf = Math.max(0, Math.floor(effect.healSelf || 0))
        const enemyAfter = getPlayerByIndex(nextMatch, enemyIndex)
        ensureEffects(enemyAfter)
        enemyAfter.effects.attack = { pct: -pct, turns }
        const healed = applyHeal(actorNext, healSelf)
        Object.assign(actorNext, healed.player)
        log.push({
          kind: 'skill',
          actorPlayerIndex: playerIndex,
          targetPlayerIndex: enemyIndex,
          slot: index + 1,
          name: skill.name,
          applied: { kind: 'attack', pct: -pct, turns },
          healedSelf: healed.healed,
        })
      } else if (effectKind === 'buff_attack_and_speed') {
        const pct = Math.max(0, Math.min(1, Number(effect.attackUpPct || 0)))
        const speedPct = Math.max(0, Math.min(1, Number(effect.speedUpPct || 0)))
        const turns = Math.max(1, Math.floor(effect.turns || 1))
        actorNext.effects.attack = { pct, turns }
        actorNext.effects.extraTurnChanceTurns = turns
        actorNext.effects.extraTurnChancePct = speedPct
        log.push({
          kind: 'skill',
          actorPlayerIndex: playerIndex,
          targetPlayerIndex: playerIndex,
          slot: index + 1,
          name: skill.name,
          applied: { kind: 'attack', pct, turns },
        })
      } else if (effectKind === 'damage_and_cooldown_increase') {
        const dmg = Math.max(0, Math.floor(effect.damage || 0))
        const inc = Math.max(1, Math.floor(effect.increaseEnemyCooldownBy || 1))
        const result = applyDamage(nextMatch, playerIndex, enemyIndex, dmg, { isUltimate })
        nextMatch = result.match
        const enemyAfter = getPlayerByIndex(nextMatch, enemyIndex)
        enemyAfter.cooldowns = Array.isArray(enemyAfter.cooldowns) ? enemyAfter.cooldowns : [0, 0, 0, 0]
        enemyAfter.cooldowns = enemyAfter.cooldowns.map((v) => Math.max(0, Math.floor(v || 0) + inc))
        log.push({
          kind: 'skill',
          actorPlayerIndex: playerIndex,
          targetPlayerIndex: enemyIndex,
          slot: index + 1,
          name: skill.name,
          dealt: result.dealt,
          evaded: result.evaded,
          reflected: result.reflected,
          countered: result.countered,
          crit: result.crit,
          itemStunApplied: result.itemStunApplied,
          applied: { kind: 'cooldown_increase', amount: inc },
        })
      } else if (effectKind === 'dodge_all_and_counter') {
        const dodgeAllTurns = Math.max(1, Math.floor(effect.dodgeAllTurns || 1))
        const counterDamage = Math.max(0, Math.floor(effect.counterDamage || 0))
        const counterTurns = Math.max(1, Math.floor(effect.counterTurns || 1))
        actorNext.effects.dodgeAllTurns = Math.max(actorNext.effects.dodgeAllTurns || 0, dodgeAllTurns)
        actorNext.effects.counter = counterDamage > 0 ? { damage: counterDamage, turns: counterTurns } : undefined
        log.push({
          kind: 'skill',
          actorPlayerIndex: playerIndex,
          targetPlayerIndex: playerIndex,
          slot: index + 1,
          name: skill.name,
          applied: {
            kind: 'dodge_all_and_counter',
            dodgeAllTurns,
            counterDamage,
            counterTurns,
          },
        })
      } else if (effectKind === 'damage_and_random') {
        const dmg = Math.max(0, Math.floor(effect.damage || 0))
        const table = Array.isArray(effect.table) ? effect.table : []
        const result = applyDamage(nextMatch, playerIndex, enemyIndex, dmg, { isUltimate })
        nextMatch = result.match
        const roll = table.length ? table[Math.floor(Math.random() * table.length)] : null
        const enemyAfter = getPlayerByIndex(nextMatch, enemyIndex)
        const actorAfter = getPlayerByIndex(nextMatch, playerIndex)
        ensureEffects(enemyAfter)
        ensureEffects(actorAfter)
        let rolled = null
        if (roll?.kind === 'stun') {
          const turns = Math.max(1, Math.floor(roll.turns || 1))
          enemyAfter.effects.stunTurns = Math.max(enemyAfter.effects.stunTurns || 0, turns)
          rolled = { kind: 'stun', turns }
        } else if (roll?.kind === 'heal_self') {
          const amount = Math.max(0, Math.floor(roll.amount || 0))
          const healed = applyHeal(actorAfter, amount)
          Object.assign(actorAfter, healed.player)
          rolled = { kind: 'heal_self', amount: healed.healed }
        } else if (roll?.kind === 'bonus_damage') {
          const bonus = Math.max(0, Math.floor(roll.amount || 0))
          const bonusResult = applyDamage(nextMatch, playerIndex, enemyIndex, bonus, { isUltimate })
          nextMatch = bonusResult.match
          rolled = { kind: 'bonus_damage', amount: bonusResult.dealt }
        } else if (roll?.kind === 'self_damage') {
          const amount = Math.max(0, Math.floor(roll.amount || 0))
          const selfResult = applyDamage(nextMatch, playerIndex, playerIndex, amount)
          nextMatch = selfResult.match
          rolled = { kind: 'self_damage', amount: selfResult.dealt }
        }
        log.push({
          kind: 'skill',
          actorPlayerIndex: playerIndex,
          targetPlayerIndex: enemyIndex,
          slot: index + 1,
          name: skill.name,
          dealt: result.dealt,
          evaded: result.evaded,
          reflected: result.reflected,
          countered: result.countered,
          crit: result.crit,
          itemStunApplied: result.itemStunApplied,
          rolled,
        })
      } else if (effectKind === 'reflect') {
        const reflectPct = Math.max(0, Math.min(1, Number(effect.reflectPct || 0)))
        const turns = Math.max(1, Math.floor(effect.turns || 1))
        actorNext.effects.reflect = { pct: reflectPct, turns }
        log.push({
          kind: 'skill',
          actorPlayerIndex: playerIndex,
          targetPlayerIndex: playerIndex,
          slot: index + 1,
          name: skill.name,
          applied: { kind: 'reflect', pct: reflectPct, turns },
        })
      } else if (effectKind === 'damage_with_recoil') {
        const dmg = Math.max(0, Math.floor(effect.damage || 0))
        const recoilSelf = Math.max(0, Math.floor(effect.recoilSelf || 0))
        const result = applyDamage(nextMatch, playerIndex, enemyIndex, dmg, { isUltimate })
        nextMatch = result.match
        const actorAfter = getPlayerByIndex(nextMatch, playerIndex)
        const before = Math.max(0, Math.floor(actorAfter.hp || 0))
        actorAfter.hp = clamp(before - recoilSelf, 0, Math.max(1, actorAfter.baseHP || 1))
        log.push({
          kind: 'skill',
          actorPlayerIndex: playerIndex,
          targetPlayerIndex: enemyIndex,
          slot: index + 1,
          name: skill.name,
          dealt: result.dealt,
          evaded: result.evaded,
          reflected: result.reflected,
          countered: result.countered,
          crit: result.crit,
          itemStunApplied: result.itemStunApplied,
          recoilSelf,
        })
      } else if (effectKind === 'heal') {
        const amount = Math.max(0, Math.floor(effect.amount || 0))
        const healed = applyHeal(actorNext, amount)
        Object.assign(actorNext, healed.player)
        log.push({
          kind: 'skill',
          actorPlayerIndex: playerIndex,
          targetPlayerIndex: playerIndex,
          slot: index + 1,
          name: skill.name,
          healed: healed.healed,
        })
      } else if (effectKind === 'damage_reduction') {
        const reduction = Math.max(0, Math.min(0.9, Number(effect.reduction || 0)))
        const turns = Math.max(1, Math.floor(effect.turns || 1))
        actorNext.effects.damageReduction = { pct: reduction, turns }
        log.push({
          kind: 'skill',
          actorPlayerIndex: playerIndex,
          targetPlayerIndex: playerIndex,
          slot: index + 1,
          name: skill.name,
          applied: { kind: 'damage_reduction', pct: reduction, turns },
        })
      } else if (effectKind === 'vulnerability') {
        const bonus = Math.max(0, Math.min(2, Number(effect.bonusDamageTaken || 0)))
        const turns = Math.max(1, Math.floor(effect.turns || 1))
        targetEnemy.effects.vulnerability = { pct: bonus, turns }
        log.push({
          kind: 'skill',
          actorPlayerIndex: playerIndex,
          targetPlayerIndex: enemyIndex,
          slot: index + 1,
          name: skill.name,
          applied: { kind: 'vulnerability', pct: bonus, turns },
        })
      } else if (effectKind === 'damage_over_time') {
        const mult = getItemMods(actorNext).debuffMultiplier
        const dotDamage = Math.max(0, Math.floor(Math.max(0, Math.floor(effect.dotDamage || 0)) * mult))
        const turns = Math.max(1, Math.floor(effect.turns || 1))
        let dealt = 0
        let reflected = 0
        let countered = 0
        let evaded = false
        let itemStunApplied = false
        let crit = false
        if (initial > 0) {
          const result = applyDamage(nextMatch, playerIndex, enemyIndex, initial, { isUltimate })
          nextMatch = result.match
          dealt = result.dealt
          reflected = result.reflected
          countered = result.countered
          evaded = result.evaded
          itemStunApplied = result.itemStunApplied
          crit = result.crit
        }
        const enemyNext = getPlayerByIndex(nextMatch, enemyIndex)
        ensureEffects(enemyNext)
        if (dotDamage > 0) enemyNext.effects.dot.push({ damage: dotDamage, turns })
        log.push({
          kind: 'skill',
          actorPlayerIndex: playerIndex,
          targetPlayerIndex: enemyIndex,
          slot: index + 1,
          name: skill.name,
          dealt,
          evaded,
          reflected,
          countered,
          itemStunApplied,
          crit,
          applied: dotDamage > 0 ? { kind: 'dot', damage: dotDamage, turns } : undefined,
        })
      } else if (effectKind === 'burst_and_dot') {
        const mult = getItemMods(actorNext).debuffMultiplier
        const dotDamage = Math.max(0, Math.floor(Math.max(0, Math.floor(effect.dotDamage || 0)) * mult))
        const turns = Math.max(1, Math.floor(effect.turns || 1))
        const result = applyDamage(nextMatch, playerIndex, enemyIndex, burst, { isUltimate })
        nextMatch = result.match
        const enemyNext = getPlayerByIndex(nextMatch, enemyIndex)
        ensureEffects(enemyNext)
        if (dotDamage > 0) enemyNext.effects.dot.push({ damage: dotDamage, turns })
        log.push({
          kind: 'skill',
          actorPlayerIndex: playerIndex,
          targetPlayerIndex: enemyIndex,
          slot: index + 1,
          name: skill.name,
          dealt: result.dealt,
          evaded: result.evaded,
          reflected: result.reflected,
          countered: result.countered,
          itemStunApplied: result.itemStunApplied,
          crit: result.crit,
          applied: dotDamage > 0 ? { kind: 'dot', damage: dotDamage, turns } : undefined,
        })
      } else if (effectKind === 'damage_and_shield') {
        const dmg = Math.max(0, Math.floor(effect.damage || 0))
        const shield = Math.max(0, Math.floor(effect.shield || 0))
        const result = applyDamage(nextMatch, playerIndex, enemyIndex, dmg, { isUltimate })
        nextMatch = result.match
        const actorAfter = getPlayerByIndex(nextMatch, playerIndex)
        actorAfter.shield = Math.max(0, Math.floor(actorAfter.shield || 0)) + shield
        log.push({
          kind: 'skill',
          actorPlayerIndex: playerIndex,
          targetPlayerIndex: enemyIndex,
          slot: index + 1,
          name: skill.name,
          dealt: result.dealt,
          evaded: result.evaded,
          reflected: result.reflected,
          countered: result.countered,
          itemStunApplied: result.itemStunApplied,
          crit: result.crit,
          gainedShield: shield,
        })
      } else if (effectKind === 'fortify') {
        const shield = Math.max(0, Math.floor(effect.shield || 0))
        const turns = Math.max(1, Math.floor(effect.turns || 1))
        const counterDamageOnHit = Math.max(0, Math.floor(effect.counterDamageOnHit || 0))
        actorNext.shield = Math.max(0, Math.floor(actorNext.shield || 0)) + shield
        actorNext.effects.counter = counterDamageOnHit > 0 ? { damage: counterDamageOnHit, turns } : undefined
        log.push({
          kind: 'skill',
          actorPlayerIndex: playerIndex,
          targetPlayerIndex: playerIndex,
          slot: index + 1,
          name: skill.name,
          gainedShield: shield,
          applied: counterDamageOnHit > 0 ? { kind: 'counter', damage: counterDamageOnHit, turns } : undefined,
        })
      } else if (effectKind === 'critical_strike') {
        const dmg = Math.max(0, Math.floor(effect.damage || 0))
        const result = applyDamage(nextMatch, playerIndex, enemyIndex, dmg, { isUltimate })
        nextMatch = result.match
        log.push({
          kind: 'skill',
          actorPlayerIndex: playerIndex,
          targetPlayerIndex: enemyIndex,
          slot: index + 1,
          name: skill.name,
          dealt: result.dealt,
          evaded: result.evaded,
          reflected: result.reflected,
          countered: result.countered,
          itemStunApplied: result.itemStunApplied,
          crit: result.crit,
        })
      } else if (effectKind === 'execute') {
        const base = Math.max(0, Math.floor(effect.damage || 0))
        const belowPct = Math.max(0, Math.min(1, Number(effect.bonusIfTargetBelowHpPct || 0)))
        const bonusDamage = Math.max(0, Math.floor(effect.bonusDamage || 0))
        const enemy = getPlayerByIndex(nextMatch, enemyIndex)
        const enemyHpPct = enemy && enemy.baseHP ? (enemy.hp || 0) / enemy.baseHP : 1
        const total = enemyHpPct <= belowPct ? base + bonusDamage : base
        const result = applyDamage(nextMatch, playerIndex, enemyIndex, total, { isUltimate })
        nextMatch = result.match
        log.push({
          kind: 'skill',
          actorPlayerIndex: playerIndex,
          targetPlayerIndex: enemyIndex,
          slot: index + 1,
          name: skill.name,
          dealt: result.dealt,
          evaded: result.evaded,
          reflected: result.reflected,
          countered: result.countered,
          itemStunApplied: result.itemStunApplied,
          crit: result.crit,
        })
      } else if (effectKind === 'gym_mode') {
        // Tara GYM! — Chano's ultimate
        const healPct = Math.max(0, Math.min(1, Number(effect.healPct || 0)))
        const attackUpPct = Math.max(0, Math.min(2, Number(effect.attackUpPct || 0)))
        const stunChancePct = Math.max(0, Math.min(1, Number(effect.stunChancePct || 0)))
        const armorPct = Math.max(0, Math.min(1, Number(effect.armorPct || 0)))
        const turns = Math.max(1, Math.floor(effect.turns || 1))
        ensureEffects(actorNext)
        // Heal 50% of base HP
        const healAmount = Math.max(0, Math.floor((actorNext.baseHP || 1) * healPct))
        const healed = applyHeal(actorNext, healAmount)
        Object.assign(actorNext, healed.player)
        // Attack boost
        actorNext.effects.attack = { pct: attackUpPct, turns }
        // Armor (damage reduction)
        if (armorPct > 0) {
          actorNext.effects.damageReduction = { pct: armorPct, turns }
        }
        // Stun chance on hit
        actorNext.effects.stunChancePct = stunChancePct
        actorNext.effects.stunChancePctTurns = turns
        log.push({
          kind: 'skill',
          actorPlayerIndex: playerIndex,
          targetPlayerIndex: playerIndex,
          slot: index + 1,
          name: skill.name,
          healedSelf: healed.healed,
          applied: { kind: 'gym_mode', attackUpPct, stunChancePct, armorPct, turns },
        })
      } else if (effectKind === 'evasion') {
        const chance = Math.max(0, Math.min(1, Number(effect.chance || 0)))
        const turns = Math.max(1, Math.floor(effect.turns || 1))
        actorNext.effects.evasion = { pct: chance, turns }
        log.push({
          kind: 'skill',
          actorPlayerIndex: playerIndex,
          targetPlayerIndex: playerIndex,
          slot: index + 1,
          name: skill.name,
          applied: { kind: 'evasion', chance, turns },
        })
      } else {
        log.push({
          kind: 'skill',
          actorPlayerIndex: playerIndex,
          targetPlayerIndex: playerIndex,
          slot: index + 1,
          name: skill.name,
          applied: { kind: effectKind },
        })
      }
    } else {
      socket.emit('room-error', { error: 'Invalid action' })
      room.match = { ...match, actionLock: false }
      return
    }

    if (isMatchOver(nextMatch)) {
      nextMatch = maybeFinalizeMatch(nextMatch)
      nextMatch.actionLock = false
      room.match = nextMatch
      io.to(code).emit('match-updated', nextMatch)
      io.to(code).emit('action-resolved', { roomCode: code, log, match: nextMatch })
      return
    }

    const advanced = advanceTurn(nextMatch)
    nextMatch = { ...maybeFinalizeMatch(advanced.match), actionLock: false }
    room.match = nextMatch
    io.to(code).emit('match-updated', nextMatch)
    io.to(code).emit('turn-updated', {
      roomCode: code,
      turnCount: nextMatch.turnCount,
      currentTurnPlayerIndex: nextMatch.currentTurnPlayerIndex,
    })
    io.to(code).emit('action-resolved', { roomCode: code, log, tickEvents: advanced.events, match: nextMatch })
  })

  socket.on('end-turn', () => {
    const code = socket.data.roomCode
    if (!code || !rooms.has(code)) {
      socket.emit('room-error', { error: 'Not in a room' })
      return
    }

    const room = rooms.get(code)
    if (!room.match) {
      socket.emit('room-error', { error: 'No active match' })
      return
    }

    const match = room.match
    const playerIndex = getPlayerIndexFromMatch(match, socket.id)
    if (!playerIndex) {
      socket.emit('room-error', { error: 'Player not registered in match' })
      return
    }

    const currentTurnPlayerIndex = match.currentTurnPlayerIndex ?? match.activePlayerIndex
    if (playerIndex !== currentTurnPlayerIndex) {
      socket.emit('room-error', { error: 'Not your turn' })
      return
    }

    const advanced = advanceTurn(match)
    const nextMatch = maybeFinalizeMatch(advanced.match)
    room.match = nextMatch
    io.to(code).emit('match-updated', nextMatch)
    io.to(code).emit('turn-updated', {
      roomCode: code,
      turnCount: nextMatch.turnCount,
      currentTurnPlayerIndex: nextMatch.currentTurnPlayerIndex,
    })
  })

  socket.on('get-match-state', () => {
    const code = socket.data.roomCode
    if (!code || !rooms.has(code)) return
    const room = rooms.get(code)
    if (!room.match) return
    socket.emit('match-updated', room.match)
  })

  socket.on('send-taunt', ({ tauntText } = {}) => {
    const code = socket.data.roomCode
    if (!code || !rooms.has(code)) return
    const room = rooms.get(code)
    const playerIndex = room.match ? getPlayerIndexFromMatch(room.match, socket.id) : null
    
    io.to(code).emit('receive-taunt', {
      socketId: socket.id,
      playerIndex,
      tauntText: tauntText?.toString().substring(0, 100) || '...'
    })
  })

  socket.on('disconnect', () => {
    leaveCurrentRoom(socket)
  })
})

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Stop the other process or run with a different PORT.`)
    process.exit(1)
  }
  console.error(err)
  process.exit(1)
})

// Catch-all route for React
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDistPath, 'index.html'))
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`)
  console.log(`Also available on your network at http://[YOUR-IP-ADDRESS]:${PORT}`)
})
