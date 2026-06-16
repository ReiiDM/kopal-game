import { useEffect, useMemo, useState, useRef } from 'react'
import { io } from 'socket.io-client'

const QUICK_TAUNTS = [
  'Iyak na lang! 😂',
  'Talo ka naman boy 💀',
  'Bawi next life! ⚰️',
  'Lakas mo ah... joke lang 🤪',
  'Galaw-galaw baka pumanaw 💀',
  'Tsamba lang yan lods 🍀',
  'Parang kulang sa gym 💪',
  'Hina naman nyan! 🥱',
  'Ez game, ez life 😎',
  'paki-buhat nga ako 🏋️'
]

function App() {
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value))
  }

  function formatPct(pct) {
    return `${Math.round(pct * 100)}%`
  }

  function effectDetailLines(effect) {
    if (!effect || typeof effect !== 'object') return []
    const kind = effect.kind
    if (kind === 'damage') return [`Damage: ${effect.amount ?? 0}`]
    if (kind === 'damage_and_heal') return [`Damage: ${effect.damage ?? 0}`, `Heal self: ${effect.healSelf ?? 0}`]
    if (kind === 'damage_and_attack_down') {
      return [
        `Damage: ${effect.damage ?? 0}`,
        `Enemy attack: -${formatPct(effect.attackDownPct ?? 0)} (${effect.turns ?? 1} turn/s)`,
      ]
    }
    if (kind === 'shield') return [`Shield: ${effect.shield ?? 0} (${effect.turns ?? 1} turn/s)`]
    if (kind === 'buff_attack_and_speed') {
      return [
        `Attack: +${formatPct(effect.attackUpPct ?? 0)} (${effect.turns ?? 1} turn/s)`,
        `Speed: +${formatPct(effect.speedUpPct ?? 0)} (${effect.turns ?? 1} turn/s)`,
      ]
    }
    if (kind === 'damage_reduction') return [`Damage reduction: ${formatPct(effect.reduction ?? 0)} (${effect.turns ?? 1} turn/s)`]
    if (kind === 'damage_and_stun') return [`Damage: ${effect.damage ?? 0}`, `Stun: ${effect.stunTurns ?? 1} turn/s`]
    if (kind === 'heal') return [`Heal: ${effect.amount ?? 0}`]
    if (kind === 'immunity') return [`Immune to damage: ${effect.turns ?? 1} turn/s`]
    if (kind === 'damage_with_miss') return [`Damage: ${effect.damage ?? 0}`, `Miss chance: ${formatPct(effect.missChance ?? 0)}`]
    if (kind === 'damage_and_cooldown_increase') {
      return [`Damage: ${effect.damage ?? 0}`, `Enemy cooldown: +${effect.increaseEnemyCooldownBy ?? 1}`]
    }
    if (kind === 'dodge_all_and_counter') {
      return [
        `Dodge all: ${effect.dodgeAllTurns ?? 1} turn/s`,
        `Counter: ${effect.counterDamage ?? 0} (${effect.counterTurns ?? 1} turn/s)`,
      ]
    }
    if (kind === 'attack_down_and_heal') {
      return [
        `Enemy attack: -${formatPct(effect.attackDownPct ?? 0)} (${effect.turns ?? 1} turn/s)`,
        `Heal self: ${effect.healSelf ?? 0}`,
      ]
    }
    if (kind === 'reflect') return [`Reflect: ${formatPct(effect.reflectPct ?? 0)} (${effect.turns ?? 1} turn/s)`]
    if (kind === 'damage_with_recoil') return [`Damage: ${effect.damage ?? 0}`, `Recoil self: ${effect.recoilSelf ?? 0}`]
    if (kind === 'gym_mode') {
      return [
        `Heal: ${Math.round((effect.healPct ?? 0) * 100)}% of max HP`,
        `Attack boost: +${Math.round((effect.attackUpPct ?? 0) * 100)}% (${effect.turns ?? 1} turn/s)`,
        `Stun on hit: ${Math.round((effect.stunChancePct ?? 0) * 100)}% chance (${effect.turns ?? 1} turn/s)`,
        `Armor: +${Math.round((effect.armorPct ?? 0) * 100)}% damage reduction (${effect.turns ?? 1} turn/s)`,
      ]
    }
    if (kind === 'damage_and_random') {
      const table = Array.isArray(effect.table) ? effect.table : []
      const rows = table.map((t) => {
        if (t.kind === 'stun') return `Random: Stun (${t.turns ?? 1} turn/s)`
        if (t.kind === 'heal_self') return `Random: Heal self (${t.amount ?? 0})`
        if (t.kind === 'bonus_damage') return `Random: Bonus damage (${t.amount ?? 0})`
        if (t.kind === 'self_damage') return `Random: Recoil damage (${t.amount ?? 0})`
        return `Random: ${t.kind}`
      })
      return [`Damage: ${effect.damage ?? 0}`, ...rows]
    }

    const entries = Object.entries(effect).filter(([k]) => k !== 'kind' && k !== 'notes' && k !== 'description')
    return [`Kind: ${kind}`, ...entries.map(([k, v]) => `${k}: ${typeof v === 'number' ? v : JSON.stringify(v)}`)]
  }

  function itemEffectDetailLines(item) {
    const effect = item?.effect
    if (!effect || typeof effect !== 'object') return []
    const kind = effect.kind
    if (kind === 'attack_up') return [`+${formatPct(effect.attackUpPct ?? 0)} damage (passive)`]
    if (kind === 'defense_up') return [`-${formatPct(effect.damageReductionPct ?? 0)} damage taken (passive)`]
    if (kind === 'crit_chance') return [`Crit chance: ${formatPct(effect.critChance ?? 0)}`, `Crit bonus damage: +${formatPct(effect.critDamagePct ?? 0)}`]
    if (kind === 'heal_per_turn') return [`Heal ${effect.healPerTurn ?? 0} HP each turn start`]
    if (kind === 'speed_up') return [`Turn start: reduce 1 random cooldown by ${effect.reduceRandomCooldownBy ?? 1}`]
    if (kind === 'flat_damage_reduction') return [`-${effect.reduceBy ?? 0} damage taken (flat)`]
    if (kind === 'stun_chance_on_damage') return [`On hit: ${formatPct(effect.chance ?? 0)} to stun (${effect.stunTurns ?? 1} turn/s)`]
    if (kind === 'debuff_boost') return [`Debuffs and DOTs are ${formatPct((effect.debuffMultiplier ?? 1) - 1)} stronger`]
    if (kind === 'random_buff_each_turn') return ['Turn start: random small buff']
    if (kind === 'ultimate_damage_boost') return [`Ultimates deal +${formatPct(effect.bonusDamagePct ?? 0)} damage`]
    return [`Kind: ${kind}`]
  }

  const [joinRoomCode, setJoinRoomCode] = useState('')
  const [status, setStatus] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [roomCode, setRoomCode] = useState('')
  const [playerCount, setPlayerCount] = useState(0)
  const [isReady, setIsReady] = useState(false)
  const [heroes, setHeroes] = useState({})
  const [items, setItems] = useState([])
  const [selectedHeroId, setSelectedHeroId] = useState('')
  const [selectedItemIds, setSelectedItemIds] = useState([])
  const [hasSentReady, setHasSentReady] = useState(false)
  const [socketError, setSocketError] = useState('')
  const [socketId, setSocketId] = useState('')
  const [matchState, setMatchState] = useState(null)
  const [actionPending, setActionPending] = useState(false)
  const [battleLogs, setBattleLogs] = useState([])
  const [setupStep, setSetupStep] = useState(1) // 1 = hero, 2 = items
  const [battleEffects, setBattleEffects] = useState([]) // To show temporary effects on characters
  const [isSkillModalOpen, setIsSkillModalOpen] = useState(false) // To show skill detail modal
  const [showWinnerModal, setShowWinnerModal] = useState(false) // To control when winner modal appears
  const [roomPlayers, setRoomPlayers] = useState([]) // For tracking players in room with team info
  const [selectedTarget, setSelectedTarget] = useState(null) // For selecting target in 2v2
  const [isShaking, setIsShaking] = useState(false)
  const [ultimateSplash, setUltimateSplash] = useState(null)
  const [turnBanner, setTurnBanner] = useState(null)
  const [flashWhite, setFlashWhite] = useState(false)
  
  const bgmIntervalRef = useRef(null)
  const bgmAudioCtxRef = useRef(null)
  const [musicEnabled, setMusicEnabled] = useState(() => {
    const saved = localStorage.getItem('kopal-bgm')
    return saved === null ? true : saved === 'true'
  })
  // Load win/loss from localStorage
  const [wins, setWins] = useState(() => {
    const saved = localStorage.getItem('kopal-wins')
    return saved ? parseInt(saved, 10) : 0
  })
  const [losses, setLosses] = useState(() => {
    const saved = localStorage.getItem('kopal-losses')
    return saved ? parseInt(saved, 10) : 0
  })

  const audioCtxRef = useRef(null)

  const resumeAudio = () => {
    try {
      // Lazy init/resume SFX context
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)()
      }
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().catch(e => console.error('SFX resume failed:', e))
      }

      // Lazy init/resume BGM context
      if (!bgmAudioCtxRef.current) {
        bgmAudioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)()
      }
      if (bgmAudioCtxRef.current && bgmAudioCtxRef.current.state === 'suspended') {
        bgmAudioCtxRef.current.resume().catch(e => console.error('BGM resume failed:', e))
      }

      // Speech synthesis unlock
      if ('speechSynthesis' in window) {
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(''))
      }
    } catch (e) {
      console.error('Failed to unlock audio:', e)
    }
  }

  const getSharedAudioContext = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)()
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => {})
    }
    return audioCtxRef.current
  }

  // Sound effects with Web Audio API
  const playSound = (type) => {
    try {
      const audioCtx = getSharedAudioContext()
      const oscillator = audioCtx.createOscillator()
      const gainNode = audioCtx.createGain()
      
      oscillator.connect(gainNode)
      gainNode.connect(audioCtx.destination)
      
      switch(type) {
        case 'attack':
          oscillator.type = 'square'
          oscillator.frequency.setValueAtTime(200, audioCtx.currentTime)
          oscillator.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.1)
          gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime)
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15)
          oscillator.start(audioCtx.currentTime)
          oscillator.stop(audioCtx.currentTime + 0.15)
          break
        case 'skill':
          oscillator.type = 'sine'
          oscillator.frequency.setValueAtTime(400, audioCtx.currentTime)
          oscillator.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.1)
          oscillator.frequency.exponentialRampToValueAtTime(400, audioCtx.currentTime + 0.2)
          gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime)
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.25)
          oscillator.start(audioCtx.currentTime)
          oscillator.stop(audioCtx.currentTime + 0.25)
          break
        case 'heal':
          oscillator.type = 'sine'
          oscillator.frequency.setValueAtTime(600, audioCtx.currentTime)
          oscillator.frequency.linearRampToValueAtTime(1200, audioCtx.currentTime + 0.2)
          gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime)
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3)
          oscillator.start(audioCtx.currentTime)
          oscillator.stop(audioCtx.currentTime + 0.3)
          break
        case 'victory':
          // Play a little melody
          const notes = [523, 659, 784, 1047]
          notes.forEach((freq, i) => {
            const osc = audioCtx.createOscillator()
            const gain = audioCtx.createGain()
            osc.connect(gain)
            gain.connect(audioCtx.destination)
            osc.type = 'sine'
            osc.frequency.setValueAtTime(freq, audioCtx.currentTime + i * 0.15)
            gain.gain.setValueAtTime(0.3, audioCtx.currentTime + i * 0.15)
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + i * 0.15 + 0.3)
            osc.start(audioCtx.currentTime + i * 0.15)
            osc.stop(audioCtx.currentTime + i * 0.15 + 0.3)
          })
          break
        case 'crit':
          oscillator.type = 'sawtooth'
          oscillator.frequency.setValueAtTime(300, audioCtx.currentTime)
          oscillator.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.2)
          gainNode.gain.setValueAtTime(0.4, audioCtx.currentTime)
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.25)
          oscillator.start(audioCtx.currentTime)
          oscillator.stop(audioCtx.currentTime + 0.25)
          break
      }
    } catch (e) {
      console.error('Sound error:', e)
    }
  }

  const [activeTaunts, setActiveTaunts] = useState({}) // { [socketId]: { text, id } }

  const triggerSpeechBubble = (socketId, text) => {
    if (!socketId) return
    const id = `${Date.now()}-${Math.random()}`
    setActiveTaunts((prev) => ({
      ...prev,
      [socketId]: { text, id }
    }))
    
    // Clear after 2.5 seconds
    setTimeout(() => {
      setActiveTaunts((prev) => {
        if (prev[socketId]?.id === id) {
          const next = { ...prev }
          delete next[socketId]
          return next
        }
        return prev
      })
    }, 2500)
  }

  // Refs to avoid stale closures in socket events
  const matchStateRef = useRef(null)
  useEffect(() => {
    matchStateRef.current = matchState
  }, [matchState])

  const roomPlayersRef = useRef([])
  useEffect(() => {
    roomPlayersRef.current = roomPlayers
  }, [roomPlayers])

  // Global audio unlocker
  useEffect(() => {
    const handleGesture = () => {
      resumeAudio()
    }

    window.addEventListener('click', handleGesture)
    window.addEventListener('touchstart', handleGesture)
    window.addEventListener('keydown', handleGesture)

    return () => {
      window.removeEventListener('click', handleGesture)
      window.removeEventListener('touchstart', handleGesture)
      window.removeEventListener('keydown', handleGesture)
    }
  }, [])

  const serverCandidates = useMemo(() => {
    const host = window.location.hostname
    const ports = [3010, 3002, 3001]
    const urls = [window.location.origin]
    for (const port of ports) {
      urls.push(`http://${host}:${port}`)
      urls.push(`http://localhost:${port}`)
      urls.push(`http://127.0.0.1:${port}`)
    }
    return [...new Set(urls)]
  }, [])

  const [serverIndex, setServerIndex] = useState(0)
  const serverUrl =
    serverCandidates[Math.min(serverIndex, serverCandidates.length - 1)] ||
    window.location.origin

  const [socket, setSocket] = useState(null)

  // Persist room code in localStorage
  useEffect(() => {
    if (roomCode) {
      localStorage.setItem('kopal-room-code', roomCode)
    } else {
      localStorage.removeItem('kopal-room-code')
    }
  }, [roomCode])

  // Auto-rejoin room on page load
  useEffect(() => {
    if (!socket || !isConnected) return
    const savedRoomCode = localStorage.getItem('kopal-room-code')
    if (savedRoomCode && !roomCode) {
      // Try to rejoin the saved room
      setIsLoading(true)
      socket.emit('join-room', { roomCode: savedRoomCode })
    }
  }, [socket, isConnected, roomCode])

  useEffect(() => {
    const s = io(serverUrl, { path: '/socket.io', autoConnect: true })
    setSocket(s)
    return () => {
      s.disconnect()
    }
  }, [serverUrl])

  useEffect(() => {
    let isActive = true

    async function loadGameData() {
      try {
        const url =
          serverUrl === window.location.origin
            ? '/api/game-data'
            : `${serverUrl}/api/game-data`
        const res = await fetch(url)
        const data = await res.json()
        if (!res.ok) {
          throw new Error(data?.error || 'Failed to load game data')
        }
        if (!isActive) return
        setHeroes(data?.heroes || {})
        setItems(Array.isArray(data?.items) ? data.items : [])
      } catch (err) {
        if (!isActive) return
        setStatus(err instanceof Error ? err.message : 'Failed to load game data')
      }
    }

    loadGameData()
    return () => {
      isActive = false
    }
  }, [serverUrl])

  useEffect(() => {
    if (!socket) return
    let isActive = true

    function onConnect() {
      if (!isActive) return
      setIsConnected(true)
      setSocketError('')
      setSocketId(socket.id || '')
      setStatus('Connected.')
    }

    function onDisconnect() {
      if (!isActive) return
      setIsConnected(false)
      setIsLoading(false)
      setIsReady(false)
      setRoomCode('')
      setPlayerCount(0)
      setSelectedHeroId('')
      setSelectedItemIds([])
      setHasSentReady(false)
      setSocketId('')
      setMatchState(null)
      setActionPending(false)
      setBattleLogs([])
      setStatus('Disconnected.')
    }

    function onConnectError(err) {
      if (!isActive) return
      setIsConnected(false)
      setIsLoading(false)
      const msg = err?.message || 'connection failed'
      setSocketError(msg)
      if (serverIndex < serverCandidates.length - 1) {
        const nextIndex = serverIndex + 1
        const nextUrl = serverCandidates[nextIndex]
        setStatus(`Socket error: ${msg}. Trying ${nextUrl}`)
        setServerIndex(nextIndex)
        return
      }
      setStatus(`Socket error: ${msg}`)
    }

    function onRoomCreated(payload) {
      setIsLoading(false)
      setRoomCode(payload?.roomCode || '')
      setPlayerCount(payload?.playerCount ?? 1)
      setIsReady(false)
      setSelectedHeroId('')
      setSelectedItemIds([])
      setHasSentReady(false)
      setMatchState(null)
      setActionPending(false)
      setBattleLogs([])
      setSetupStep(1)
      setShowWinnerModal(false)
      setStatus('Room created. Share the code.')
    }

    function onRoomJoined(payload) {
      setIsLoading(false)
      setRoomCode(payload?.roomCode || '')
      setPlayerCount(payload?.playerCount ?? 1)
      setIsReady((payload?.playerCount ?? 1) === 2)
      setSelectedHeroId('')
      setSelectedItemIds([])
      setHasSentReady(false)
      setMatchState(null)
      setActionPending(false)
      setBattleLogs([])
      setSetupStep(1)
      setShowWinnerModal(false)
      setStatus(`Joined room ${payload?.roomCode || ''}.`)
    }

    function onRoomState(payload) {
      if (!payload?.roomCode) return
      setRoomCode(payload.roomCode)
      setPlayerCount(payload?.playerCount ?? 0)
      setRoomPlayers(payload?.players || [])
      // Don't auto set isReady anymore, since we need 4 players with 2 per team
    }

    function onRoomReady(payload) {
      setIsReady(true)
      if (payload?.roomCode) {
        setStatus(`Room ${payload.roomCode} ready (${playerCount === 2 ? '1v1' : '2v2'} mode).`)
      } else {
        setStatus('Room ready.')
      }
    }

    function onPlayerLeft() {
      setIsReady(false)
      setHasSentReady(false)
      setMatchState(null)
      setActionPending(false)
      setBattleLogs([])
      setShowWinnerModal(false)
      setStatus('A player left the room.')
    }

    function onRoomError(payload) {
      setIsLoading(false)
      setIsReady(false)
      setHasSentReady(false)
      setActionPending(false)
      setStatus(payload?.error || 'Room error')
    }

    function onPlayAgainInit() {
      // Reset local state for setup, keep room code
      setMatchState(null)
      setActionPending(false)
      setBattleLogs([])
      setSelectedHeroId('')
      setSelectedItemIds([])
      setHasSentReady(false)
      setSetupStep(1)
      setBattleEffects([])
      setShowWinnerModal(false)
      setStatus('Ready to play again!')
    }

    function onMatchStarted(payload) {
      setMatchState(payload || null)
      setActionPending(false)
      setBattleLogs([])
      setShowWinnerModal(false)
      setStatus('Match started.')
    }

    function onMatchUpdated(payload) {
      setMatchState(payload || null)
      // Check if match ended
      if (payload?.result?.kind) {
        const winner = payload.result.winnerPlayerIndex
        if (winner && myPlayerIndex) {
          if (winner === myPlayerIndex) {
            // Win!
            playSound('victory')
            setWins((prev) => {
              const newWins = prev + 1
              localStorage.setItem('kopal-wins', newWins.toString())
              return newWins
            })
            setTimeout(() => {
              const winnerPlayer = payload.players?.find(p => p.playerIndex === winner)
              if (winnerPlayer?.socketId) {
                triggerSpeechBubble(winnerPlayer.socketId, 'Panalo ako! Iyak na lang! 😂')
              }
            }, 800)
          } else {
            // Loss
            setLosses((prev) => {
              const newLosses = prev + 1
              localStorage.setItem('kopal-losses', newLosses.toString())
              return newLosses
            })
            setTimeout(() => {
              const loserPlayer = payload.players?.find(p => p.playerIndex === (winner === 1 ? 2 : 1))
              if (loserPlayer?.socketId) {
                triggerSpeechBubble(loserPlayer.socketId, 'Talo ako... 💀')
              }
            }, 800)
          }
        }
      }
    }

    function formatPlayerName(match, playerIndex) {
      const p = match?.players?.find((x) => x?.playerIndex === playerIndex)
      return p?.heroName || (playerIndex === 1 ? 'Player A' : 'Player B')
    }

    function formatTickEvent(match, ev) {
      if (!ev || typeof ev !== 'object') return null
      const name = formatPlayerName(match, ev.playerIndex)
      if (ev.kind === 'dot') return `${name} took ${ev.amount} DOT damage`
      if (ev.kind === 'hot') return `${name} healed ${ev.amount}`
      if (ev.kind === 'item-heal') return `${name} healed ${ev.amount} (Fishball Power)`
      if (ev.kind === 'item-cooldown-reduce') return `${name}'s cooldown reduced (Energy Drink)`
      if (ev.kind === 'item-random') return `${name} got a random buff (Pamahiin Charm)`
      if (ev.kind === 'stun-skip') return `${name} is stunned and skips the turn`
      if (ev.kind === 'extra-turn') return `${name} gets an EXTRA TURN!`
      return null
    }

    function formatActionLine(match, entry) {
      if (!entry || typeof entry !== 'object') return null
      const actor = formatPlayerName(match, entry.actorPlayerIndex)
      const actionName = entry.name || 'an action'

      if (entry.missed) return `${actor} used ${actionName} but missed`
      if (entry.evaded && !entry.dealt) return `${actor} used ${actionName} but it was dodged`

      const parts = [`${actor} used ${actionName}`]
      if (entry.dealt) parts.push(`dealing ${entry.dealt} damage`)
      if (entry.healedSelf) parts.push(`and healed ${entry.healedSelf}`)
      if (entry.healed) parts.push(`and healed ${entry.healed}`)
      if (entry.gainedShield) parts.push(`and gained ${entry.gainedShield} shield`)
      if (entry.recoilSelf) parts.push(`and took ${entry.recoilSelf} recoil`)
      if (entry.crit) parts.push('(CRIT)')
      if (entry.itemStunApplied) parts.push('(stunned via Old Nokia)')
      if (entry.rolled?.kind === 'stun') parts.push(`(random: stun ${entry.rolled.turns} turn)`)
      if (entry.rolled?.kind === 'heal_self') parts.push(`(random: healed ${entry.rolled.amount})`)
      if (entry.rolled?.kind === 'bonus_damage') parts.push(`(random: +${entry.rolled.amount} bonus damage)`)
      if (entry.rolled?.kind === 'self_damage') parts.push(`(random: took ${entry.rolled.amount} recoil damage)`)
      return parts.join(' ')
    }

    function onActionResolved(payload) {
      setActionPending(false)
      const match = payload?.match || null
      const lines = []
      const logEntries = Array.isArray(payload?.log) ? payload.log : []

      // Look for ultimate action (slot 4)
      const ultimateAction = logEntries.find(entry => entry.kind === 'skill' && entry.slot === 4)
      if (ultimateAction) {
        const actor = match?.players?.find(p => p.playerIndex === ultimateAction.actorPlayerIndex)
        if (actor) {
          setUltimateSplash({
            heroId: actor.heroId,
            heroName: actor.heroName || 'Hero',
            skillName: ultimateAction.name || 'Ultimate'
          })
          setFlashWhite(true)
          setTimeout(() => setFlashWhite(false), 600)
          
          setIsShaking(true)
          setTimeout(() => setIsShaking(false), 500)
          
          setTimeout(() => {
            setUltimateSplash(null)
          }, 1800)
        }
      } else {
        const hasCrit = logEntries.some(entry => entry.crit)
        if (hasCrit) {
          setIsShaking(true)
          setTimeout(() => setIsShaking(false), 500)
        }
      }

      for (const entry of logEntries) {
        const line = formatActionLine(match, entry)
        if (line) lines.push(line)
        
        // Play sound effects
        if (entry.actorPlayerIndex) {
          if (entry.crit) {
            playSound('crit')
          } else if (entry.healedSelf || entry.healed || entry.gainedShield) {
            playSound('heal')
          } else if (entry.name && entry.name !== myHeroDef?.normalAttack?.name) {
            playSound('skill')
          } else {
            playSound('attack')
          }

          // Play meme voiceover
          if (entry.name) {
            const nameMap = {
              'Palo-Palo Lang': 'palo palo lang',
              'Ayy Inday!': 'aray inday!',
              'Tsismis Barrage': 'tsismis muna bago sapak',
              'Laban Kung Laban': 'laban kung laban!',
              'Inday Rage Mode': 'inday rage mode, activated!',
              'Suntok na Makunat': 'suntok na makunat!',
              'Balat na Makapal': 'makapal ang mukha, este balat',
              'Pisngi Slam': 'sampal sa pisngi!',
              'Self Love Muna': 'self love muna, huwag kang mang-gulo',
              'Hindi Ako Tinatablan': 'hindi ako tinatablan!',
              'Singit Hit': 'singit hit!',
              'Banlag Strike': 'banlag strike! asan ka ba tumitingin?',
              'Liko Liko': 'liko liko, iwas muna',
              'Gulat Ka No?': 'gulat ka no?',
              'Walang Makaka-Tama': 'walang makakatama sa akin!',
              'Trip Lang': 'trip lang kitang bugbugin',
              'Ay Beh!': 'ay beh!',
              'Drama Mode': 'drama mode muna, iyak tawa',
              'Biglang Bawi': 'biglang bawi, ibalik sa\'yo',
              'Finale Performance': 'finale performance, bow!',
              'Tamad na Suntok': 'suntok na tamad',
              'Bahala Na, Basta Makatulog': 'bahala na, basta makatulog',
              'Gym Tomorrow Na Lang': 'gym tomorrow na lang',
              'Sige, Isang Bigay Pa!': 'sige, isang bigay pa, buhat pa!',
              'Tara GYM!': 'tara gym! buhat tayo, tol!'
            }
            const speechText = nameMap[entry.name]
            if (speechText && entry.actorPlayerIndex) {
              const actorPlayer = match?.players?.find(p => p.playerIndex === entry.actorPlayerIndex)
              if (actorPlayer?.socketId) {
                triggerSpeechBubble(actorPlayer.socketId, speechText)
              }
            }
          }
        }
        
        // Add battle effect for the action
        if (entry.actorPlayerIndex) {
          // Add individual effect for damage
          if (entry.dealt) {
            const effectId = `${Date.now()}-${Math.random()}`
            setBattleEffects((prev) => [...prev, {
              id: effectId,
              playerIndex: entry.targetPlayerIndex || entry.actorPlayerIndex,
              text: `-${entry.dealt}`,
              type: 'damage'
            }])
            
            setTimeout(() => {
              setBattleEffects((prev) => prev.filter(e => e.id !== effectId))
            }, 1500)
          }
          
          // Add effect for self-heal
          if (entry.healedSelf) {
            const effectId = `${Date.now()}-${Math.random()}`
            setBattleEffects((prev) => [...prev, {
              id: effectId,
              playerIndex: entry.actorPlayerIndex,
              text: `+${entry.healedSelf}`,
              type: 'heal'
            }])
            
            setTimeout(() => {
              setBattleEffects((prev) => prev.filter(e => e.id !== effectId))
            }, 1500)
          }
          
          // Add effect for healing others
          if (entry.healed) {
            const effectId = `${Date.now()}-${Math.random()}`
            setBattleEffects((prev) => [...prev, {
              id: effectId,
              playerIndex: entry.targetPlayerIndex,
              text: `+${entry.healed}`,
              type: 'heal'
            }])
            
            setTimeout(() => {
              setBattleEffects((prev) => prev.filter(e => e.id !== effectId))
            }, 1500)
          }

          // Add effect for self_damage roll recoil
          if (entry.rolled?.kind === 'self_damage' && entry.rolled.amount) {
            const effectId = `${Date.now()}-${Math.random()}`
            setBattleEffects((prev) => [...prev, {
              id: effectId,
              playerIndex: entry.actorPlayerIndex,
              text: `-${entry.rolled.amount}`,
              type: 'damage'
            }])
            
            setTimeout(() => {
              setBattleEffects((prev) => prev.filter(e => e.id !== effectId))
            }, 1500)
          }
          
          // Add shield effect
          if (entry.gainedShield) {
            const effectId = `${Date.now()}-${Math.random()}`
            setBattleEffects((prev) => [...prev, {
              id: effectId,
              playerIndex: entry.targetPlayerIndex || entry.actorPlayerIndex,
              text: `🛡️+${entry.gainedShield}`,
              type: 'shield'
            }])
            
            setTimeout(() => {
              setBattleEffects((prev) => prev.filter(e => e.id !== effectId))
            }, 1500)
          }
          
          // Add miss/dodge effects
          if (entry.missed) {
            const effectId = `${Date.now()}-${Math.random()}`
            setBattleEffects((prev) => [...prev, {
              id: effectId,
              playerIndex: entry.actorPlayerIndex,
              text: 'Miss!',
              type: 'miss'
            }])
            
            setTimeout(() => {
              setBattleEffects((prev) => prev.filter(e => e.id !== effectId))
            }, 1500)
          } else if (entry.evaded && !entry.dealt) {
            const effectId = `${Date.now()}-${Math.random()}`
            setBattleEffects((prev) => [...prev, {
              id: effectId,
              playerIndex: entry.targetPlayerIndex,
              text: 'Dodged!',
              type: 'dodge'
            }])
            
            setTimeout(() => {
              setBattleEffects((prev) => prev.filter(e => e.id !== effectId))
            }, 1500)
          }

          // Stun pop-up: Nokia or skill-based stun
          const stunTarget = entry.targetPlayerIndex || entry.actorPlayerIndex
          const stunTriggered =
            entry.itemStunApplied ||
            entry.applied?.kind === 'stun' ||
            entry.rolled?.kind === 'stun'
          if (stunTriggered && stunTarget) {
            const effectId = `${Date.now()}-${Math.random()}`
            setBattleEffects((prev) => [...prev, {
              id: effectId,
              playerIndex: stunTarget,
              text: '⚡ STUNNED!',
              type: 'stun'
            }])
            setTimeout(() => {
              setBattleEffects((prev) => prev.filter(e => e.id !== effectId))
            }, 2000)
          }
        }
      }
      const tickEvents = Array.isArray(payload?.tickEvents) ? payload.tickEvents : []
      for (const ev of tickEvents) {
        const line = formatTickEvent(match, ev)
        if (line) lines.push(line)
        
        // Handle tick events like dots and hots
        if (ev.playerIndex && (ev.kind === 'dot' || ev.kind === 'hot' || ev.kind === 'item-heal')) {
          const effectId = `${Date.now()}-${Math.random()}`
          const isHeal = ev.kind === 'hot' || ev.kind === 'item-heal'
          setBattleEffects((prev) => [...prev, {
            id: effectId,
            playerIndex: ev.playerIndex,
            text: isHeal ? `+${ev.amount}` : `-${ev.amount}`,
            type: isHeal ? 'heal' : 'damage'
          }])
          
          if (isHeal) playSound('heal')
          
          setTimeout(() => {
            setBattleEffects((prev) => prev.filter(e => e.id !== effectId))
          }, 1500)
        }
      }

      if (lines.length) {
        setBattleLogs((prev) => {
          const turn = payload?.match?.turnCount ?? payload?.match?.turn
          const prefix = turn ? `T${turn}: ` : ''
          const next = [...prev, ...lines.map((text) => ({ id: `${Date.now()}-${Math.random()}`, text: `${prefix}${text}` }))]
          return next.slice(-60)
        })
        setStatus(lines[0])
      } else {
        setStatus('Action resolved.')
      }
    }

    function onMatchCancelled(payload) {
      setMatchState(null)
      setActionPending(false)
      setBattleLogs([])
      setShowWinnerModal(false)
      if (payload?.reason) {
        setStatus(`Match cancelled: ${payload.reason}`)
      } else {
        setStatus('Match cancelled.')
      }
    }

    function onPlayerReadySaved(payload) {
      setHasSentReady(true)
      if (payload?.roomCode) {
        setStatus(`Ready saved for ${payload.roomCode}.`)
      } else {
        setStatus('Ready saved.')
      }
    }

    function onPlayerReadyState(payload) {
      if (payload?.roomCode) {
        setStatus(`Ready: ${payload.readyCount}/${payload.playerCount}`)
      }
    }

    function onReceiveTaunt(payload) {
      if (!payload || !payload.socketId) return
      
      // Play a quick test sound
      playSound('attack')

      // Display speech bubble
      triggerSpeechBubble(payload.socketId, payload.tauntText)

      // Find sender name from matchStateRef or roomPlayersRef
      let senderName = 'Someone'
      const match = matchStateRef.current
      const players = roomPlayersRef.current
      if (match?.players) {
        const p = match.players.find(x => x.socketId === payload.socketId)
        if (p) senderName = p.heroName || `Player ${p.playerIndex}`
      } else if (players) {
        const p = players.find(x => x.socketId === payload.socketId)
        if (p) {
          senderName = p.socketId === socket.id ? 'You' : `Player (${p.team === 1 ? 'Team 1' : 'Team 2'})`
        }
      }

      // Add to battle logs
      const logLine = `${senderName}: "${payload.tauntText}"`
      setBattleLogs((prev) => {
        const next = [...prev, { id: `${Date.now()}-${Math.random()}`, text: `💬 ${logLine}` }]
        return next.slice(-60)
      })

      // Also set status text
      setStatus(logLine)
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('connect_error', onConnectError)
    socket.on('room-created', onRoomCreated)
    socket.on('room-joined', onRoomJoined)
    socket.on('room-state', onRoomState)
    socket.on('room-ready', onRoomReady)
    socket.on('player-left', onPlayerLeft)
    socket.on('room-error', onRoomError)
    socket.on('play-again-init', onPlayAgainInit)
    socket.on('match-started', onMatchStarted)
    socket.on('match-updated', onMatchUpdated)
    socket.on('action-resolved', onActionResolved)
    socket.on('match-cancelled', onMatchCancelled)
    socket.on('player-ready-saved', onPlayerReadySaved)
    socket.on('player-ready-state', onPlayerReadyState)
    socket.on('receive-taunt', onReceiveTaunt)

    return () => {
      isActive = false
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('connect_error', onConnectError)
      socket.off('room-created', onRoomCreated)
      socket.off('room-joined', onRoomJoined)
      socket.off('room-state', onRoomState)
      socket.off('room-ready', onRoomReady)
      socket.off('player-left', onPlayerLeft)
      socket.off('room-error', onRoomError)
      socket.off('play-again-init', onPlayAgainInit)
      socket.off('match-started', onMatchStarted)
      socket.off('match-updated', onMatchUpdated)
      socket.off('action-resolved', onActionResolved)
      socket.off('match-cancelled', onMatchCancelled)
      socket.off('player-ready-saved', onPlayerReadySaved)
      socket.off('player-ready-state', onPlayerReadyState)
      socket.off('receive-taunt', onReceiveTaunt)
    }
  }, [socket, serverCandidates, serverIndex])

  function handleCreateRoom() {
    if (!socket) return
    setIsLoading(true)
    setStatus('')
    setIsReady(false)
    socket.emit('create-room')
  }

  function handleJoinRoom() {
    if (!socket) return
    const code = joinRoomCode.trim().toUpperCase()
    if (!code) {
      setStatus('Enter a room code to join.')
      return
    }

    setIsLoading(true)
    setStatus('')
    setIsReady(false)
    socket.emit('join-room', { roomCode: code })
  }

  function handleLeaveRoom() {
    if (!socket) return
    socket.emit('leave-room')
    setRoomCode('')
    setPlayerCount(0)
    setIsReady(false)
    setSelectedHeroId('')
    setSelectedItemIds([])
    setHasSentReady(false)
    setMatchState(null)
    setActionPending(false)
    setBattleLogs([])
    setSetupStep(1)
    setShowWinnerModal(false)
    setStatus('Left room.')
  }

  function handlePlayAgain() {
    if (!socket || !roomCode) return
    setActionPending(false)
    setBattleLogs([])
    setShowWinnerModal(false)
    setStatus('Starting rematch...')
    socket.emit('play-again')
  }

  function handleGoToMainMenu() {
    setShowWinnerModal(false)
    handleLeaveRoom()
  }

  function handleGoToCharacterSelection() {
    if (!socket || !roomCode) return
    // Reset to setup
    setMatchState(null)
    setActionPending(false)
    setBattleLogs([])
    setSelectedHeroId('')
    setSelectedItemIds([])
    setHasSentReady(false)
    setSetupStep(1)
    setShowWinnerModal(false)
    setStatus('Back to character selection!')
    // Also reset server side (send play again)
    socket.emit('play-again')
  }

  function toggleItem(id) {
    setSelectedItemIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= 3) {
        setStatus('You can select up to 3 items.')
        return prev
      }
      return [...prev, id]
    })
  }

  const selectedHero = selectedHeroId ? heroes?.[selectedHeroId] : null

  const canSendReady = Boolean(roomCode) && Boolean(selectedHeroId) && selectedItemIds.length === 3

  function handleReady() {
    if (!socket) return
    if (!canSendReady) {
      setStatus('Select 1 hero and 3 items before ready.')
      return
    }
    socket.emit('player-ready', { heroId: selectedHeroId, itemIds: selectedItemIds })
    setStatus('Sending ready...')
  }

  const handleSwitchTeam = () => {
    if (!socket) return
    socket.emit('switch-team')
  }

  const myPlayerIndex = useMemo(() => {
    if (!matchState?.players || !socketId) return null
    const entry = matchState.players.find((p) => p?.socketId === socketId)
    return entry?.playerIndex ?? null
  }, [matchState, socketId])

  const currentTurnPlayerIndex = matchState?.currentTurnPlayerIndex ?? matchState?.activePlayerIndex ?? null
  const isMyTurn = Boolean(myPlayerIndex && currentTurnPlayerIndex && myPlayerIndex === currentTurnPlayerIndex)

  const myMatchPlayer = useMemo(() => {
    if (!matchState?.players || !myPlayerIndex) return null
    return matchState.players.find((p) => p?.playerIndex === myPlayerIndex) || null
  }, [matchState, myPlayerIndex])

  const enemyMatchPlayer = useMemo(() => {
    if (!matchState?.players || !myPlayerIndex) return null
    const enemyIndex = myPlayerIndex === 1 ? 2 : 1
    return matchState.players.find((p) => p?.playerIndex === enemyIndex) || null
  }, [matchState, myPlayerIndex])

  const enemyPlayers = useMemo(() => {
    if (!matchState?.players || !myPlayerIndex) return []
    const myTeam = (matchState.players.find(p => p.playerIndex === myPlayerIndex))?.team
    return matchState.players.filter(p => p.team !== myTeam && (p.hp || 0) > 0)
  }, [matchState, myPlayerIndex])

  const myHeroDef = myMatchPlayer?.heroId ? heroes?.[myMatchPlayer.heroId] : null

  const isMatchOver = Boolean(matchState?.endedAt)
  const isWinner = isMatchOver && matchState?.result?.winnerPlayerIndex === myPlayerIndex
  const turnNumber = matchState?.turnCount ?? matchState?.turn ?? 1
  const turnDamageBoostPct = turnNumber >= 8 ? 0.2 : turnNumber >= 6 ? 0.1 : 0
  const page = matchState ? 'battle' : roomCode ? 'setup' : 'lobby'

  // Effect to delay showing winner modal
  useEffect(() => {
    if (isMatchOver) {
      // Wait 2 seconds then show modal
      const timeout = setTimeout(() => {
        setShowWinnerModal(true)
      }, 2000)
      // Cleanup timeout
      return () => clearTimeout(timeout)
    } else {
      // If match is not over, hide modal
      setShowWinnerModal(false)
    }
  }, [isMatchOver])

  // Effect for active turn slide-in banner
  useEffect(() => {
    if (!matchState || isMatchOver) {
      setTurnBanner(null)
      return
    }
    const teamLabel = isMyTurn ? 'YOUR TURN' : "ENEMY'S TURN"
    setTurnBanner(teamLabel)
    const timer = setTimeout(() => {
      setTurnBanner(null)
    }, 1500)
    return () => clearTimeout(timer)
  }, [currentTurnPlayerIndex, isMyTurn, isMatchOver, matchState])

  useEffect(() => {
    // Reset target selection when turn changes
    setSelectedTarget(null)
  }, [currentTurnPlayerIndex])

  // BGM Player
  useEffect(() => {
    if (!musicEnabled || isMatchOver) {
      if (bgmIntervalRef.current) {
        clearInterval(bgmIntervalRef.current)
        bgmIntervalRef.current = null
      }
      if (bgmAudioCtxRef.current) {
        bgmAudioCtxRef.current.close().catch(() => {})
        bgmAudioCtxRef.current = null
      }
      return
    }

    if (!bgmAudioCtxRef.current) {
      bgmAudioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)()
    }
    const audioCtx = bgmAudioCtxRef.current

    // Simple 8-bit pentatonic bassline loop
    const notes = [
      110.00, 110.00, 130.81, 146.83, 
      164.81, 164.81, 146.83, 130.81,
      110.00, 110.00, 146.83, 164.81, 
      196.00, 164.81, 146.83, 130.81
    ]
    let step = 0

    const interval = setInterval(() => {
      if (audioCtx.state === 'suspended') {
        return
      }
      const freq = notes[step % notes.length]
      
      const osc = audioCtx.createOscillator()
      const gainNode = audioCtx.createGain()
      
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime)
      
      gainNode.gain.setValueAtTime(0.04, audioCtx.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.33)
      
      osc.connect(gainNode)
      gainNode.connect(audioCtx.destination)
      
      osc.start()
      osc.stop(audioCtx.currentTime + 0.35)
      
      step++
    }, 350)

    bgmIntervalRef.current = interval

    return () => {
      clearInterval(interval)
    }
  }, [musicEnabled, isMatchOver])

  function handleNormalAttack() {
    if (!socket || !matchState) return
    setActionPending(true)
    setStatus('Resolving...')
    socket.emit('player-action', { kind: 'normal', targetPlayerIndex: selectedTarget })
  }

  function handleSkill(index) {
    if (!socket || !matchState) return
    setActionPending(true)
    setStatus('Resolving...')
    socket.emit('player-action', { kind: 'skill', skillIndex: index, targetPlayerIndex: selectedTarget })
  }

  function handleGoBackToSetup() {
    if (!socket || !matchState) return
    setShowWinnerModal(false)
    socket.emit('go-back-to-setup')
  }

  function formatPlayerLabel(index, team) {
    if (!index) return '—'
    const teamLabel = team ? `(Team ${team}) ` : ''
    return `${teamLabel}Player ${index}`
  }

  function getHpPct(p) {
    const hp = Math.max(0, Number(p?.hp || 0))
    const base = Math.max(1, Number(p?.baseHP || 1))
    return clamp(Math.round((hp / base) * 100), 0, 100)
  }

  function getShieldPct(p) {
    const shield = Math.max(0, Number(p?.shield || 0))
    const base = Math.max(1, Number(p?.baseHP || 1))
    return clamp(Math.round((shield / base) * 100), 0, 100)
  }

  return (
    <div className="min-h-full bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-full max-w-3xl flex-col justify-center px-6 py-12">
        <header className="mb-10">
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-3xl font-semibold tracking-tight">Kopal Battlefield</h1>
            <div className="text-sm flex items-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  const newVal = !musicEnabled
                  setMusicEnabled(newVal)
                  localStorage.setItem('kopal-bgm', newVal.toString())
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${
                  musicEnabled 
                    ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40' 
                    : 'bg-slate-800/40 text-slate-400 border-slate-700/40 hover:bg-slate-800'
                }`}
              >
                {musicEnabled ? '🎵 Music: On' : '🔇 Music: Off'}
              </button>
              <button
                type="button"
                onClick={() => {
                  resumeAudio()
                  playSound('skill')
                }}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border bg-slate-800/40 text-slate-300 border-slate-700/40 hover:bg-slate-800 transition-all active:scale-95 duration-100"
              >
                🔊 Test Sound
              </button>
              <span className="text-emerald-400 font-bold">🏆 {wins} Wins</span>
              <span className="text-slate-400 font-bold">💀 {losses} Losses</span>
            </div>
          </div>
          <p className="mt-2 text-sm text-slate-300">
            {page === 'battle'
              ? 'Battle'
              : page === 'setup'
                ? 'Setup your hero and items.'
                : 'Create a room or join an existing one.'}
          </p>
        </header>

        {page !== 'battle' && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3 text-sm">
            <div className="text-slate-200">
              {isConnected ? 'Socket: connected' : 'Socket: disconnected'}
              <span className="ml-2 text-slate-400">({serverUrl})</span>
            </div>
            <div className="text-slate-300">
              Room: {roomCode ? `${roomCode} (${playerCount}/4)` : '—'}
              {isReady ? ' • ready' : ''}
            </div>
            {!isConnected && socketError ? (
              <div className="text-xs text-rose-300">{socketError}</div>
            ) : null}
            {isConnected && socketId ? (
              <div className="text-xs text-slate-400">id: {socketId}</div>
            ) : null}
            {roomCode ? (
              <button
                type="button"
                className="rounded-lg border border-slate-700 bg-slate-950/40 px-3 py-1.5 text-sm font-medium text-slate-100 hover:bg-slate-900"
                onClick={handleLeaveRoom}
              >
                Leave
              </button>
            ) : null}
          </div>
        )}

        {page === 'lobby' ? (
          <div className="grid gap-6 md:grid-cols-2">
          <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
            <h2 className="text-lg font-semibold">Create Room</h2>
            <p className="mt-1 text-sm text-slate-300">
              Generates a new 6-character room code.
            </p>
            <button
              type="button"
              className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={handleCreateRoom}
              disabled={isLoading || !isConnected}
            >
              {isLoading ? 'Working…' : 'Create Room'}
            </button>
          </section>

          <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
            <h2 className="text-lg font-semibold">Join Room</h2>
            <p className="mt-1 text-sm text-slate-300">
              Enter the code you got from your friend.
            </p>
            <label className="mt-5 block">
              <span className="sr-only">Room code</span>
              <input
                value={joinRoomCode}
                onChange={(e) => setJoinRoomCode(e.target.value)}
                placeholder="ABC123"
                className="w-full rounded-lg border border-slate-800 bg-slate-950/40 px-4 py-2 font-mono text-sm tracking-widest text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                maxLength={12}
              />
            </label>
            <button
              type="button"
              className="mt-4 inline-flex w-full items-center justify-center rounded-lg border border-slate-700 bg-slate-950/40 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={handleJoinRoom}
              disabled={isLoading || !isConnected}
            >
              {isLoading ? 'Working…' : 'Join Room'}
            </button>
          </section>
          </div>
        ) : null}

        {page === 'setup' ? (
          <section className="mt-6 rounded-xl border border-slate-800 bg-slate-900/40 p-6">
            <div>
              <h2 className="text-lg font-semibold">Player Setup</h2>
              <p className="mt-1 text-sm text-slate-300">
                {setupStep === 1 ? "Pick your hero!" : setupStep === 2 ? "Choose 3 items!" : ""}
              </p>
            </div>

            {/* Team Display */}
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Team 1 */}
              <div className="rounded-lg border border-red-800 bg-red-950/30 p-4">
                <div className="text-sm font-semibold text-red-300 mb-2">🔴 Team 1 ({roomPlayers.filter(p => p.team === 1).length}/2)</div>
                <div className="space-y-1">
                  {roomPlayers.filter(p => p.team === 1).map(p => (
                    <div key={p.socketId} className="relative flex items-center justify-between py-1">
                      <div className={`text-sm ${p.isReady ? 'text-emerald-300' : 'text-slate-400'}`}>
                        {p.isReady ? '✅ Ready' : '⏳ Waiting...'} {p.socketId === socketId ? '(You)' : ''}
                      </div>
                      {activeTaunts[p.socketId] && (
                        <div className="absolute right-0 top-1/2 transform translate-x-[110%] -translate-y-1/2 z-30 bg-white text-slate-950 px-2 py-1 rounded-lg text-xs font-bold border border-slate-950 whitespace-nowrap shadow-lg animate-pulse">
                          {activeTaunts[p.socketId].text}
                          <div className="absolute left-0 top-1/2 transform -translate-x-full -translate-y-1/2 w-0 h-0 border-y-4 border-y-transparent border-r-4 border-r-white" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Team 2 */}
              <div className="rounded-lg border border-blue-800 bg-blue-950/30 p-4">
                <div className="text-sm font-semibold text-blue-300 mb-2">🔵 Team 2 ({roomPlayers.filter(p => p.team === 2).length}/2)</div>
                <div className="space-y-1">
                  {roomPlayers.filter(p => p.team === 2).map(p => (
                    <div key={p.socketId} className="relative flex items-center justify-between py-1">
                      <div className={`text-sm ${p.isReady ? 'text-emerald-300' : 'text-slate-400'}`}>
                        {p.isReady ? '✅ Ready' : '⏳ Waiting...'} {p.socketId === socketId ? '(You)' : ''}
                      </div>
                      {activeTaunts[p.socketId] && (
                        <div className="absolute right-0 top-1/2 transform translate-x-[110%] -translate-y-1/2 z-30 bg-white text-slate-950 px-2 py-1 rounded-lg text-xs font-bold border border-slate-950 whitespace-nowrap shadow-lg animate-pulse">
                          {activeTaunts[p.socketId].text}
                          <div className="absolute left-0 top-1/2 transform -translate-x-full -translate-y-1/2 w-0 h-0 border-y-4 border-y-transparent border-r-4 border-r-white" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Switch Team Button */}
            {!hasSentReady ? (
              <div className="mt-4">
                <button
                  type="button"
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-slate-600 to-slate-700 hover:from-slate-500 hover:to-slate-600 text-white font-medium text-sm rounded-lg transition-all duration-300"
                  onClick={handleSwitchTeam}
                  disabled={!isConnected}
                >
                  🔄 Switch Team
                </button>
              </div>
            ) : null}

            {/* Step 1: Hero Selection */}
            {setupStep === 1 && (
              <div className="mt-6 grid gap-4">
                <div className="rounded-lg border border-slate-800 bg-slate-950/30 p-4">
                  <div className="text-sm font-semibold flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-indigo-500 text-white flex items-center justify-center text-xs">1</span>
                    Select Hero
                  </div>
                  <div className="mt-3 grid gap-2">
                    {Object.values(heroes).map((h) => (
                      <button
                        key={h.id}
                        type="button"
                        onClick={() => setSelectedHeroId(h.id)}
                        className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-all ${
                          selectedHeroId === h.id
                            ? 'border-indigo-500 bg-indigo-500/10 shadow-[0_0_10px_rgba(99,102,241,0.2)]'
                            : 'border-slate-800 bg-slate-950/30 hover:bg-slate-900/40'
                        }`}
                      >
                        {/* Hero Image Thumbnail */}
                        <div className="w-14 h-14 rounded-full border-2 border-slate-600 overflow-hidden bg-slate-800 flex items-center justify-center flex-shrink-0">
                          <img 
                            src={`/images/${h.id}.jpg`} 
                            alt={h.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.target.src = `/images/${h.id}.png`
                              e.target.onerror = (e2) => {
                                e2.target.src = `https://picsum.photos/seed/${h.id}/100/100`
                                e2.target.onerror = (e3) => {
                                  e3.target.style.display = 'none'
                                  e3.target.nextElementSibling.style.display = 'flex'
                                }
                              }
                            }}
                          />
                          <div className="w-full h-full flex items-center justify-center text-2xl text-slate-500" style={{ display: 'none' }}>
                            {h.name.charAt(0)}
                          </div>
                        </div>

                        <div className="flex-1">
                          <div className="flex items-baseline gap-1.5">
                            <span className="font-medium text-base">{h.name}</span>
                            {h.role && <span className="text-xs text-slate-500 font-normal">— {h.role}</span>}
                          </div>
                          <div className="text-xs text-slate-400">❤️ {h.baseHP} HP</div>
                        </div>
                        {selectedHeroId === h.id && (
                          <div className="text-emerald-400 text-xl">✓</div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Skills Preview (shown when hero selected) */}
                {selectedHero && (
                  <div className="rounded-lg border border-slate-800 bg-slate-950/30 p-4">
                    <div className="text-sm font-semibold flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-purple-500 text-white flex items-center justify-center text-xs">1.5</span>
                      {selectedHero.name}'s Skills
                    </div>
                    
                    <div className="mt-2 text-xs text-slate-400 mb-3">
                      Base HP: {selectedHero.baseHP}
                    </div>

                    <div className="mt-2 rounded-lg border border-slate-700 bg-slate-950/50 p-3">
                      <div className="text-xs font-semibold text-indigo-300 mb-2">⚔️ Normal Attack</div>
                      <div className="text-sm text-slate-200">{selectedHero.normalAttack?.name}</div>
                      {selectedHero.normalAttack?.description ? (
                        <div className="mt-1 text-xs text-slate-300">{selectedHero.normalAttack.description}</div>
                      ) : null}
                      <div className="mt-2 space-y-0.5 text-xs text-slate-400">
                        {effectDetailLines(selectedHero.normalAttack?.effect).map((line) => (
                          <div key={line}>{line}</div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-3 grid gap-2">
                      {(selectedHero.skills || []).map((s, index) => (
                        <div key={s.name} className="rounded-lg border border-slate-700 bg-slate-950/50 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="font-medium text-sm flex items-center gap-2">
                              {s.type === 'ultimate' ? <span className="text-yellow-400">⭐</span> : ''}
                              {s.name}
                            </div>
                            <div className={`text-xs px-2 py-1 rounded-full ${
                              s.type === 'ultimate' ? 'bg-yellow-500/20 text-yellow-300' :
                              s.type === 'defense' ? 'bg-blue-500/20 text-blue-300' :
                              s.type === 'utility' ? 'bg-purple-500/20 text-purple-300' :
                              'bg-red-500/20 text-red-300'
                            }`}>
                              {s.type} • CD {s.cooldown}
                            </div>
                          </div>
                          {s.description ? (
                            <div className="mt-2 text-xs text-slate-300">{s.description}</div>
                          ) : null}
                          <div className="mt-2 space-y-0.5 text-xs text-slate-400">
                            {effectDetailLines(s.effect).map((line) => (
                              <div key={line}>{line}</div>
                            ))}
                            {s.effect?.notes ? (
                              <div className="text-slate-300 italic">💡 {s.effect.notes}</div>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Next Button for Step 1 */}
                {selectedHero && (
                  <button
                    type="button"
                    className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 text-white font-bold text-lg rounded-xl transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-indigo-500/30"
                    onClick={() => {
                      setSetupStep(2);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                  >
                    Next: Select Items →
                  </button>
                )}
              </div>
            )}

            {/* Step 2: Item Selection */}
            {setupStep === 2 && (
              <div className="mt-6 grid gap-4">
                {/* Back Button */}
                <button
                  type="button"
                  className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl border border-slate-700 bg-slate-950/30 text-slate-200 font-bold text-lg transition-all duration-300 hover:bg-slate-900/50"
                  onClick={() => {
                    setSetupStep(1);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                >
                  ← Back to Hero Selection
                </button>

                <div className="rounded-lg border border-slate-800 bg-slate-950/30 p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs">2</span>
                      Select 3 Items
                    </div>
                    <div className={`text-xs font-bold px-2 py-1 rounded-full ${
                      selectedItemIds.length === 3 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {selectedItemIds.length}/3
                    </div>
                  </div>
                  
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {items.map((it) => {
                      const checked = selectedItemIds.includes(it.id)
                      const disabled = !checked && selectedItemIds.length >= 3
                      
                      // Map item IDs to their image filenames
                      const getItemImage = (itemId) => {
                        const imageMap = {
                          'tsinelas_ni_nanay': 'tsinelas.png',
                          'anting_anting': 'anting-anting.png',
                          'lucky_3_coins': 'lucky-3-coins.png',
                          'fishball_power': 'fishball.jpg',
                          'jacket_ni_kuya': 'jacket.jpg',
                          'old_nokia': 'nokia.jpg',
                          'chismis_notebook': 'tsismis.jpg',
                          'energy_drink': 'energy_drink.jpg',
                          'pamahiin_charm': 'pamahiin.jpg',
                          'final_blessing': 'blessing.jpg'
                        }
                        const filename = imageMap[itemId]
                        if (filename) {
                          return `/images/${filename}`
                        }
                        // Fallback to placeholder
                        const itemImageSeed = itemId.replace(/[^a-zA-Z0-9]/g, '')
                        return `https://picsum.photos/seed/${itemImageSeed}/80/80`
                      }
                      
                      const itemImage = getItemImage(it.id)
                      
                      return (
                        <label
                          key={it.id}
                          className={`relative flex flex-col cursor-pointer items-center gap-2 rounded-lg border px-2 py-3 text-sm transition-all ${
                            checked
                              ? 'border-emerald-500 bg-emerald-500/10 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                              : 'border-slate-800 bg-slate-950/30 hover:bg-slate-900/40'
                          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          <div className="w-12 h-12 rounded-lg border border-slate-600 overflow-hidden bg-slate-800 flex items-center justify-center flex-shrink-0">
                            <img 
                              src={itemImage} 
                              alt={it.name}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                const itemImageSeed = it.id.replace(/[^a-zA-Z0-9]/g, '')
                                e.target.src = `https://picsum.photos/seed/${itemImageSeed}/80/80`
                              }}
                            />
                          </div>
                          
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={checked}
                            disabled={disabled}
                            onChange={() => toggleItem(it.id)}
                          />
                          
                          <div className="text-center w-full">
                            <div className={`font-semibold text-xs ${checked ? 'text-emerald-300' : 'text-slate-200'}`}>
                              {it.name}
                            </div>
                            {it.description ? (
                              <div className="mt-0.5 text-xs text-slate-400 line-clamp-2">
                                {it.description}
                              </div>
                            ) : null}
                          </div>

                          {checked && (
                            <div className="absolute top-1 right-1 text-emerald-400 text-lg">✓</div>
                          )}
                        </label>
                      )
                    })}
                  </div>

                  {/* Ready Button */}
                  {selectedItemIds.length === 3 && (
                    <button
                      type="button"
                      className="mt-4 w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-bold text-lg rounded-xl transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-emerald-500/30"
                      onClick={handleReady}
                      disabled={!isConnected || hasSentReady || !selectedHero}
                    >
                      {hasSentReady ? (
                        <>⏳ Waiting for other players...</>
                      ) : (
                        <>🎉 I'm Ready!</>
                      )}
                    </button>
                  )}
                </div>
              </div>
            )}
          </section>
        ) : null}

        {page === 'battle' ? (
          <>
            <section className={`mt-6 rounded-xl border border-slate-800 bg-slate-900/40 p-6 pb-32 md:pb-6 transition-all duration-300 ${isShaking ? 'animate-shake' : ''}`}>
              <div className="grid gap-6">
                <div className="rounded-lg border border-slate-800 bg-slate-950/30 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm font-semibold">
                      Turn {turnNumber} • {formatPlayerLabel(currentTurnPlayerIndex, (matchState.players || []).find(p => p.playerIndex === currentTurnPlayerIndex)?.team)}'s turn
                      {isMatchOver ? ' • match over' : ''}
                    </div>
                    <div className="text-xs text-slate-300">
                      {myPlayerIndex ? `You are ${formatPlayerLabel(myPlayerIndex, (matchState.players || []).find(p => p.playerIndex === myPlayerIndex)?.team)}` : ''}
                      {isMyTurn && !isMatchOver ? ' • your move' : ''}
                      {actionPending ? ' • resolving…' : ''}
                    </div>
                  </div>
                  {turnDamageBoostPct > 0 ? (
                    <div className="mt-2 text-xs text-amber-300 font-bold animate-pulse">
                      ⚡ Damage boost active: +{Math.round(turnDamageBoostPct * 100)}%
                    </div>
                  ) : null}
                </div>

                {/* Players in responsive layout (1 column mobile, 4 columns desktop) */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {(matchState.players || []).map((p) => {
                    if (!p) return null
                    const isSelf = p.socketId === socketId
                    const isCurrentTurn = (matchState.currentTurnPlayerIndex ?? matchState.activePlayerIndex) === p.playerIndex
                    const hpPct = getHpPct(p)
                    const shieldPct = getShieldPct(p)
                    const barShieldPct = clamp(Math.min(shieldPct, 100 - hpPct), 0, 100)
                    const heroImagePath = `/images/${p.heroId}.jpg`
                    const placeholderImage = `https://picsum.photos/seed/${p.heroId}/200/200`
                    const playerEffects = battleEffects.filter(e => e.playerIndex === p.playerIndex)
                    
                    const teamColor = p.team === 1 
                      ? 'border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.2)]' 
                      : 'border-blue-500/50 shadow-[0_0_20px_rgba(59,130,246,0.2)]'
                    
                    const isStunned = (p.effects?.stunTurns || 0) > 0

                    return (
                      <div
                        key={p.playerIndex}
                        className={`relative rounded-lg border bg-slate-950/30 p-4 transition-all duration-300 ${
                          isStunned
                            ? 'border-yellow-400'
                            : isCurrentTurn
                              ? `${teamColor} ring-2 ring-indigo-500`
                              : teamColor
                        }`}
                        style={isStunned ? {
                          animation: 'stunBorder 0.9s ease-in-out infinite',
                          boxShadow: '0 0 16px 4px rgba(234,179,8,0.6)'
                        } : {}}
                      >
                        {/* Battle Speech Bubble */}
                        {activeTaunts[p.socketId] && (
                          <div className="absolute -top-14 left-1/2 transform -translate-x-1/2 z-30 animate-bounce bg-white text-slate-950 px-3 py-1.5 rounded-xl text-xs font-black shadow-2xl border-2 border-slate-950 whitespace-nowrap">
                            {activeTaunts[p.socketId].text}
                            <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-full w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-white" />
                          </div>
                        )}

                        {/* Full-card stun yellow tint overlay */}
                        {isStunned && (
                          <div
                            className="absolute inset-0 rounded-lg pointer-events-none z-10"
                            style={{
                              background: 'rgba(234,179,8,0.08)',
                              animation: 'stunFlicker 0.9s ease-in-out infinite'
                            }}
                          />
                        )}
                        {/* Item images in top left corner */}
                        <div className="absolute top-2 left-2 flex gap-1 flex-wrap max-w-24 z-10">
                          {Array.isArray(p.itemIds) && p.itemIds.map((itemId) => {
                            const getItemImage = (itemId) => {
                              const imageMap = {
                                'tsinelas_ni_nanay': 'tsinelas.png',
                                'anting_anting': 'anting-anting.png',
                                'lucky_3_coins': 'lucky-3-coins.png',
                                'fishball_power': 'fishball.jpg',
                                'jacket_ni_kuya': 'jacket.jpg',
                                'old_nokia': 'nokia.jpg',
                                'chismis_notebook': 'tsismis.jpg',
                                'energy_drink': 'energy_drink.jpg',
                                'pamahiin_charm': 'pamahiin.jpg',
                                'final_blessing': 'blessing.jpg'
                              }
                              const filename = imageMap[itemId]
                              if (filename) {
                                return `/images/${filename}`
                              }
                              const itemImageSeed = itemId.replace(/[^a-zA-Z0-9]/g, '')
                              return `https://picsum.photos/seed/${itemImageSeed}/32/32`
                            }
                            
                            return (
                              <div key={itemId} className="w-6 h-6 rounded border border-slate-700 overflow-hidden bg-slate-800 flex items-center justify-center">
                                <img 
                                  src={getItemImage(itemId)}
                                  alt=""
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            )
                          })}
                        </div>
                        
                        {/* Hero Image with stun overlay OUTSIDE overflow-hidden */}
                        <div className="flex justify-center mb-3">
                          <div className="relative">
                            <div className={`w-20 h-20 rounded-full border-4 overflow-hidden bg-slate-800 flex items-center justify-center ${
                              isStunned ? 'border-yellow-400' : 'border-slate-700'
                            }`}>
                              <img 
                                src={heroImagePath} 
                                alt={p.heroName || 'Hero'} 
                                className="w-full h-full object-cover"
                                style={isStunned ? { filter: 'brightness(0.65) saturate(0.4)' } : {}}
                                onError={(e) => {
                                  e.target.src = `/images/${p.heroId}.png`
                                  e.target.onerror = (e2) => {
                                    e2.target.src = placeholderImage
                                    e2.target.onerror = (e3) => {
                                      e3.target.style.display = 'none'
                                      e3.target.nextElementSibling.style.display = 'flex'
                                    }
                                  }
                                }}
                              />
                              <div className="w-full h-full flex items-center justify-center text-3xl text-slate-500" style={{ display: 'none' }}>
                                {p.heroName?.charAt(0) || '?'}
                              </div>
                            </div>
                            {/* ⚡ Stun overlay — OUTSIDE overflow-hidden so it's always visible */}
                            {isStunned && (
                              <div
                                className="absolute inset-0 rounded-full flex items-center justify-center pointer-events-none"
                                style={{
                                  background: 'rgba(234,179,8,0.35)',
                                  animation: 'stunFlicker 0.8s ease-in-out infinite'
                                }}
                              >
                                <span style={{ fontSize: '1.6rem', lineHeight: 1, filter: 'drop-shadow(0 0 6px rgba(234,179,8,1))' }}>⚡</span>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {/* Temporary battle effects (damage numbers, STUNNED!, etc.) */}
                        {playerEffects.length > 0 && (
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
                            <div className="flex flex-col items-center gap-1">
                              {playerEffects.map((effect, i) => {
                                const colors = {
                                  damage: '#f87171',
                                  heal: '#4ade80',
                                  shield: '#38bdf8',
                                  miss: '#fde68a',
                                  dodge: '#fde68a',
                                  stun: '#fde047'
                                }
                                const color = colors[effect.type] || '#fff'
                                return (
                                  <div
                                    key={effect.id}
                                    style={{
                                      color,
                                      fontWeight: 'bold',
                                      fontSize: effect.type === 'stun' ? '1.1rem' : '1.4rem',
                                      textShadow: `0 0 8px ${color}`,
                                      animation: 'floatUp 1.5s ease-out forwards',
                                      animationDelay: `${i * 0.06}s`,
                                      opacity: 0,
                                      whiteSpace: 'nowrap'
                                    }}
                                  >
                                    {effect.text}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}

                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold">
                              {formatPlayerLabel(p.playerIndex)} {isSelf ? '(You)' : ''}
                            </div>
                            <div className="truncate text-xs text-slate-300">{p.heroName || '—'}</div>
                          </div>
                          <div className="text-right text-xs text-slate-300 font-mono">
                            <span className={hpPct < 30 ? 'text-red-400 font-bold' : 'text-emerald-400'}>
                              HP {Math.max(0, p.hp || 0)}/{Math.max(1, p.baseHP || 1)}
                            </span>
                            {p.shield ? <span className="ml-2 text-sky-400">🛡️ {p.shield}</span> : ''}
                          </div>
                        </div>
                        <div className="mt-3 h-3 overflow-hidden rounded-full border border-slate-800 bg-slate-900/40">
                          <div className="flex h-full w-full">
                            <div className="h-full transition-all duration-500" 
                                 style={{ 
                                   width: `${hpPct}%`,
                                   background: hpPct < 30 ? '#ef4444' : hpPct < 60 ? '#eab308' : '#22c55e' 
                                 }} />
                            {barShieldPct > 0 ? (
                              <div className="h-full bg-sky-400 transition-all duration-500" style={{ width: `${barShieldPct}%` }} />
                            ) : null}
                          </div>
                        </div>
                        {p.effects && typeof p.effects === 'object' && <div className="mt-3 flex flex-wrap gap-2">
                          {p.effects.stunTurns > 0 && (
                            <span
                              className="px-2 py-1 text-xs rounded-full font-bold border"
                              style={{
                                background: 'rgba(234,179,8,0.2)',
                                color: '#fde047',
                                borderColor: 'rgba(234,179,8,0.6)',
                                animation: 'stunGlow 0.9s ease-in-out infinite'
                              }}
                            >
                              ⚡ Stunned {p.effects.stunTurns > 1 ? `(${p.effects.stunTurns} turns)` : '(1 turn)'}
                            </span>
                          )}
                          {p.effects.stunChancePctTurns > 0 && (
                            <span
                              className="px-2 py-1 text-xs rounded-full font-bold border"
                              style={{
                                background: 'rgba(251,146,60,0.2)',
                                color: '#fb923c',
                                borderColor: 'rgba(251,146,60,0.6)',
                              }}
                            >
                              🏋️ GYM MODE ({p.effects.stunChancePctTurns} turns)
                            </span>
                          )}
                          {p.effects.attack && p.effects.attack.pct < 0 && (
                            <span className="px-2 py-1 bg-red-500/20 text-red-300 text-xs rounded-full">
                              📉 Atk - {Math.abs(p.effects.attack.pct * 100)}%
                            </span>
                          )}
                          {p.effects.attack && p.effects.attack.pct > 0 && (
                            <span className="px-2 py-1 bg-green-500/20 text-green-300 text-xs rounded-full">
                              📈 Atk + {p.effects.attack.pct * 100}%
                            </span>
                          )}
                          {p.effects.dodgeAllTurns > 0 && <span className="px-2 py-1 bg-purple-500/20 text-purple-300 text-xs rounded-full">
                            🌀 Dodge All ({p.effects.dodgeAllTurns})
                          </span>}
                          {p.effects.immunityTurns > 0 && <span className="px-2 py-1 bg-cyan-500/20 text-cyan-300 text-xs rounded-full">
                            🛡️ Immune
                          </span>}
                          {p.effects.damageReduction && <span className="px-2 py-1 bg-indigo-500/20 text-indigo-300 text-xs rounded-full">
                            🛡️ Def +{p.effects.damageReduction.pct * 100}%
                          </span>}
                          {p.effects.reflect && <span className="px-2 py-1 bg-pink-500/20 text-pink-300 text-xs rounded-full">
                            🔄 Reflect
                          </span>}
                          {p.effects.extraTurnChanceTurns > 0 && <span className="px-2 py-1 bg-orange-500/20 text-orange-300 text-xs rounded-full">
                            🎲 {p.effects.extraTurnChancePct * 100}% Extra Turn ({p.effects.extraTurnChanceTurns})
                          </span>}
                        </div>}
                      </div>
                    )
                  })}
                </div>

                {/* Target selection (for 2v2) */}
                {enemyPlayers.length > 1 && (
                  <div className="rounded-lg border border-slate-800 bg-slate-950/30 p-4 mb-4">
                    <div className="text-sm font-semibold mb-3">Select Target</div>
                    <div className="grid grid-cols-2 gap-3">
                      {enemyPlayers.map(p => (
                        <button
                          key={p.playerIndex}
                          type="button"
                          onClick={() => setSelectedTarget(p.playerIndex)}
                          className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-all duration-300 ${
                            selectedTarget === p.playerIndex
                              ? 'border-red-500 bg-red-950/30 shadow-[0_0_15px_rgba(239,68,68,0.3)]'
                              : 'border-slate-700 bg-slate-950/30 hover:bg-slate-900/40'
                          }`}
                        >
                          <div className="w-10 h-10 rounded-full border-2 border-slate-700 overflow-hidden bg-slate-800 flex items-center justify-center flex-shrink-0">
                            <img
                              src={`/images/${p.heroId}.jpg`}
                              alt={p.heroName}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.target.src = `/images/${p.heroId}.png`
                              }}
                            />
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium">{formatPlayerLabel(p.playerIndex, p.team)}</div>
                            <div className="text-xs text-slate-400 truncate">{p.heroName}</div>
                            <div className="text-xs text-emerald-400 font-mono mt-1">
                              HP {Math.max(0, p.hp || 0)}/{Math.max(1, p.baseHP || 1)}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Desktop: Action buttons - skills only in 2 columns */}
                <div className={`hidden md:block rounded-lg border border-slate-800 bg-slate-950/30 p-4 ${actionPending ? 'animate-pulse' : ''}`}>
                  <div className="text-sm font-semibold">Actions</div>
                  <div className="mt-1 text-xs text-slate-300">
                    {isMatchOver ? 'Match ended.' : isMyTurn ? 'Choose one action.' : 'Waiting for the other player.'}
                  </div>

                  {!isMatchOver ? (
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        className="inline-flex items-center justify-center rounded-lg bg-gradient-to-r from-indigo-500 to-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-lg hover:shadow-indigo-500/30 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={handleNormalAttack}
                        disabled={!isConnected || !isMyTurn || actionPending}
                      >
                        ⚔️ {myHeroDef?.normalAttack?.name || 'Normal Attack'}
                      </button>

                      {(myHeroDef?.skills || []).map((s, index) => {
                        const cd = Array.isArray(myMatchPlayer?.cooldowns) ? myMatchPlayer.cooldowns[index] || 0 : 0
                        const turnLocked = typeof s.minTurn === 'number' && turnNumber < s.minTurn
                        const disabled = !isConnected || !isMyTurn || actionPending || cd > 0 || turnLocked
                        const isUltimate = s.type === 'ultimate'
                        const cdProgress = cd > 0 ? ((s.cooldown - cd) / s.cooldown) * 100 : 100
                        return (
                          <button
                            key={s.name}
                            type="button"
                            className={`relative flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left text-sm font-semibold transition-all duration-200 disabled:cursor-not-allowed ${
                              isUltimate
                                ? 'border-yellow-500 bg-gradient-to-r from-yellow-900/40 to-yellow-800/40 text-yellow-100 hover:border-yellow-400'
                                : 'border-slate-700 bg-slate-950/40 text-slate-100 hover:border-indigo-500 hover:bg-slate-900'
                            } ${disabled ? 'opacity-60' : ''}`}
                            onClick={() => handleSkill(index)}
                            disabled={disabled}
                          >
                            <div className="min-w-0 flex-1">
                              <span className="block truncate">
                                {isUltimate && '💥 '}{s.name}
                              </span>
                              <span className="text-xs mt-1 block text-slate-400">
                                {s.type} • CD {s.cooldown}
                              </span>
                              {cd > 0 && (
                                <div className="mt-2 h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-gradient-to-r from-indigo-500 to-indigo-400 transition-all duration-300"
                                    style={{ width: `${cdProgress}%` }}
                                  />
                                </div>
                              )}
                            </div>
                            <span className={`shrink-0 text-xs px-2 py-1 rounded-full ${
                              cd > 0 
                                ? 'bg-slate-800 text-slate-400' 
                                : turnLocked
                                  ? 'bg-orange-500/20 text-orange-300'
                                  : isUltimate 
                                    ? 'bg-yellow-500/30 text-yellow-300' 
                                    : 'bg-green-500/30 text-green-300'
                            }`}>
                              {cd > 0 ? `${cd} turn${cd > 1 ? 's' : ''}` : turnLocked ? `🔒 Turn ${s.minTurn}` : 'Ready'}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  ) : null}
                </div>

                {/* Trash Talk Panel - visible on battle page below actions */}
                <div className="rounded-lg border border-slate-800 bg-slate-950/30 p-4">
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                    💬 Trash Talk / Quick Taunt React
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {QUICK_TAUNTS.map((taunt) => (
                      <button
                        key={taunt}
                        type="button"
                        onClick={() => {
                          if (socket) {
                            socket.emit('send-taunt', { tauntText: taunt })
                          }
                        }}
                        className="px-2.5 py-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-100 text-xs font-medium rounded-lg border border-slate-700 hover:border-slate-500 transition-all active:scale-95 duration-100"
                      >
                        {taunt}
                      </button>
                    ))}
                  </div>
                </div>

              </div>
            </section>

            {/* Mobile: Bottom Action Bar */}
            <div className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900 border-t border-slate-800 p-3 md:hidden">
              <div className="flex items-center justify-between gap-2">
                {/* Normal Attack [A] */}
                <button
                  type="button"
                  className="flex-1 aspect-square flex items-center justify-center rounded-lg bg-gradient-to-r from-indigo-500 to-indigo-600 text-white font-bold text-lg shadow-lg hover:shadow-indigo-500/30 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                  onClick={handleNormalAttack}
                  disabled={!isConnected || !isMyTurn || actionPending}
                >
                  A
                </button>

                {/* Skill 1 */}
                {(myHeroDef?.skills?.[0]) && (
                  <button
                    type="button"
                    className={`flex-1 aspect-square flex items-center justify-center rounded-lg font-bold text-lg shadow-lg transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed ${
                      myHeroDef.skills[0].type === 'ultimate'
                        ? 'bg-gradient-to-r from-yellow-500 to-yellow-600 text-white hover:shadow-yellow-500/30'
                        : 'bg-slate-700 text-white hover:bg-slate-600'
                    }`}
                    onClick={() => handleSkill(0)}
                    disabled={!isConnected || !isMyTurn || actionPending || (Array.isArray(myMatchPlayer?.cooldowns) ? (myMatchPlayer.cooldowns[0] || 0) > 0 : false)}
                  >
                    1
                  </button>
                )}

                {/* Skill 2 */}
                {(myHeroDef?.skills?.[1]) && (
                  <button
                    type="button"
                    className={`flex-1 aspect-square flex items-center justify-center rounded-lg font-bold text-lg shadow-lg transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed ${
                      myHeroDef.skills[1].type === 'ultimate'
                        ? 'bg-gradient-to-r from-yellow-500 to-yellow-600 text-white hover:shadow-yellow-500/30'
                        : 'bg-slate-700 text-white hover:bg-slate-600'
                    }`}
                    onClick={() => handleSkill(1)}
                    disabled={!isConnected || !isMyTurn || actionPending || (Array.isArray(myMatchPlayer?.cooldowns) ? (myMatchPlayer.cooldowns[1] || 0) > 0 : false)}
                  >
                    2
                  </button>
                )}

                {/* Skill 3 */}
                {(myHeroDef?.skills?.[2]) && (
                  <button
                    type="button"
                    className={`flex-1 aspect-square flex items-center justify-center rounded-lg font-bold text-lg shadow-lg transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed ${
                      myHeroDef.skills[2].type === 'ultimate'
                        ? 'bg-gradient-to-r from-yellow-500 to-yellow-600 text-white hover:shadow-yellow-500/30'
                        : 'bg-slate-700 text-white hover:bg-slate-600'
                    }`}
                    onClick={() => handleSkill(2)}
                    disabled={!isConnected || !isMyTurn || actionPending || (Array.isArray(myMatchPlayer?.cooldowns) ? (myMatchPlayer.cooldowns[2] || 0) > 0 : false)}
                  >
                    3
                  </button>
                )}

                {/* SS (Ultimate) or Skill 4 */}
                {(myHeroDef?.skills?.[3]) && (
                  <button
                    type="button"
                    className={`flex-1 aspect-square flex items-center justify-center rounded-lg font-bold text-lg shadow-lg transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed ${
                      myHeroDef.skills[3].type === 'ultimate'
                        ? 'bg-gradient-to-r from-yellow-500 to-yellow-600 text-white hover:shadow-yellow-500/30'
                        : 'bg-slate-700 text-white hover:bg-slate-600'
                    }`}
                    onClick={() => handleSkill(3)}
                    disabled={!isConnected || !isMyTurn || actionPending || (Array.isArray(myMatchPlayer?.cooldowns) ? (myMatchPlayer.cooldowns[3] || 0) > 0 : false)}
                  >
                    SS
                  </button>
                )}

                {/* Info Button → */}
                <button
                  type="button"
                  className="aspect-square flex items-center justify-center rounded-lg bg-slate-700 text-white font-bold text-lg shadow-lg hover:bg-slate-600 transition-all duration-200"
                  onClick={() => setIsSkillModalOpen(true)}
                >
                  →
                </button>
              </div>
            </div>
          </>
        ) : null}

        {/* Skill Detail Modal */}
        {isSkillModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
            <div className="relative w-full mx-2 bg-slate-900 border-2 border-slate-700 rounded-2xl md:max-w-md md:mx-4 p-4 text-center shadow-2xl max-h-[70vh] overflow-y-auto">
              <button
                type="button"
                className="absolute top-3 right-3 text-slate-400 hover:text-white text-xl"
                onClick={() => setIsSkillModalOpen(false)}
              >
                ✕
              </button>
              
              <h2 className="text-xl font-bold text-white mb-3">Skills</h2>

              {/* Normal Attack */}
              {myHeroDef?.normalAttack && (
                <div className="mt-2 rounded-lg border border-slate-700 bg-slate-950/50 p-3 text-left">
                  <div className="font-bold text-indigo-300 text-sm">⚔️ {myHeroDef.normalAttack.name} (A)</div>
                  {myHeroDef.normalAttack.description && (
                    <div className="text-xs text-slate-300 mt-1">{myHeroDef.normalAttack.description}</div>
                  )}
                  <div className="mt-1 text-xs text-slate-400">
                    {effectDetailLines(myHeroDef.normalAttack.effect).map((line, i) => (
                      <div key={i}>{line}</div>
                    ))}
                  </div>
                </div>
              )}

              {/* Skills List */}
              {(myHeroDef?.skills || []).map((s, i) => {
                const isUltimate = s.type === 'ultimate'
                const skillLabel = i === 3 ? 'SS' : (i + 1).toString()
                return (
                  <div key={s.name} className="mt-2 rounded-lg border bg-slate-950/50 p-3 text-left"
                    style={{ borderColor: isUltimate ? 'rgba(234,179,8,0.5)' : 'rgba(71,85,105,0.5)' }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-bold text-sm"
                        style={{ color: isUltimate ? 'rgba(250,204,21,1)' : 'rgba(226,232,240,1)' }}
                      >
                        {isUltimate ? '💥' : ''} {s.name} ({skillLabel})
                      </div>
                      <div className="text-xs px-2 py-0.5 rounded-full"
                        style={{
                          backgroundColor: isUltimate
                            ? 'rgba(234,179,8,0.2)'
                            : 'rgba(51,65,85,1)',
                          color: isUltimate
                            ? 'rgba(250,204,21,1)'
                            : 'rgba(148,163,184,1)'
                        }}
                      >
                        {s.type} • CD {s.cooldown}
                      </div>
                    </div>
                    {s.description && (
                      <div className="text-xs text-slate-300 mt-1">{s.description}</div>
                    )}
                    <div className="mt-1 text-xs text-slate-400">
                      {effectDetailLines(s.effect).map((line, j) => (
                        <div key={j}>{line}</div>
                      ))}
                      {s.effect?.notes && (
                        <div className="text-slate-300 italic mt-1 text-xs">💡 {s.effect.notes}</div>
                      )}
                    </div>
                  </div>
                )
              })}
              
              <button
                type="button"
                className="w-full mt-4 inline-flex items-center justify-center gap-2 px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white font-bold text-lg rounded-xl transition-all duration-300"
                onClick={() => setIsSkillModalOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* Winner Modal Overlay */}
        {isMatchOver && (
          <div className={`fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm overflow-hidden transition-opacity duration-500 ${showWinnerModal ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            {/* Confetti */}
            <div className="absolute inset-0 pointer-events-none">
              {[...Array(20)].map((_, i) => (
                <div
                  key={i}
                  className="absolute top-0 animate-fall"
                  style={{
                    left: `${Math.random() * 100}%`,
                    animationDelay: `${Math.random() * 2}s`,
                    animationDuration: `${2 + Math.random() * 2}s`
                  }}
                >
                  {['🎉', '🎊', '⭐', '✨', '🌟', '💫'][Math.floor(Math.random() * 6)]}
                </div>
              ))}
            </div>
            
            <div className={`relative max-w-md w-full mx-4 transition-all duration-500 ${showWinnerModal ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`}>
              {/* Background Effects */}
              <div className="absolute -inset-1.5 bg-gradient-to-r from-yellow-400 via-yellow-500 to-yellow-600 rounded-2xl blur-lg opacity-75"></div>
              
              {/* Modal Content */}
              <div className="relative bg-slate-900/95 border-2 border-yellow-500/50 rounded-2xl p-8 text-center shadow-2xl">
                {/* Trophy Icon */}
                <div className="text-6xl mb-4 animate-pulse">
                  🏆
                </div>
                
                {/* Winner Text */}
                <h2 className="text-3xl font-bold text-white mb-2">
                  {matchState?.result?.kind === 'draw'
                    ? 'It\'s a Draw!'
                    : `${formatPlayerLabel(matchState?.result?.winnerPlayerIndex)} Wins!`}
                </h2>
                
                {/* Hero Name & Turn Info */}
                <p className="text-yellow-400 text-lg mb-1">
                  {(() => {
                    const winnerPlayer = matchState?.players?.find(p => p.playerIndex === matchState?.result?.winnerPlayerIndex);
                    return winnerPlayer?.heroName || 'Victory';
                  })()}
                </p>
                <p className="text-slate-400 text-sm mb-8">
                  Ended on turn {turnNumber}
                  {matchState?.result?.reason ? ` • ${matchState.result.reason}` : ''}
                </p>
                
                {/* Options Buttons */}
                <div className="grid gap-3">
                  {/* Play Again Button */}
                  <button
                    type="button"
                    className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-400 hover:to-yellow-500 text-slate-950 font-bold text-lg rounded-xl transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-lg shadow-yellow-500/30"
                    onClick={handlePlayAgain}
                    disabled={!isConnected}
                  >
                    🔄 Play Again
                  </button>

                  {/* Change Setup Button */}
                  <button
                    type="button"
                    className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 text-white font-bold text-lg rounded-xl transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-lg shadow-indigo-500/30"
                    onClick={handleGoBackToSetup}
                    disabled={!isConnected}
                  >
                    🎭 Change Setup
                  </button>

                  {/* Main Menu Button */}
                  <button
                    type="button"
                    className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-slate-700 to-slate-800 hover:from-slate-600 hover:to-slate-700 text-white font-bold text-lg rounded-xl transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-lg"
                    onClick={handleGoToMainMenu}
                    disabled={!isConnected}
                  >
                    🏠 Main Menu
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {status ? (
          <div className="mt-6 rounded-lg border border-slate-800 bg-slate-950/40 px-4 py-3 text-sm text-slate-200">
            {status}
          </div>
        ) : null}

        {/* Dynamic Visual Polish Overlays */}
        {flashWhite && (
          <div className="fixed inset-0 bg-white pointer-events-none z-50 animate-flash-white" />
        )}

        {turnBanner && (
          <div className="fixed top-1/3 left-1/2 z-40 animate-turn-banner pointer-events-none">
            <div className={`px-8 py-4 rounded-xl border text-2xl font-black tracking-widest uppercase shadow-2xl ${
              turnBanner === 'YOUR TURN'
                ? 'bg-emerald-950/95 text-emerald-400 border-emerald-500/50 shadow-emerald-500/30'
                : 'bg-rose-950/95 text-rose-400 border-rose-500/50 shadow-rose-500/30'
            }`}>
              {turnBanner}
            </div>
          </div>
        )}

        {ultimateSplash && (
          <div className="fixed inset-0 flex items-center justify-center bg-black/70 z-50 pointer-events-none overflow-hidden">
            <div className="absolute w-[500px] h-[500px] rounded-full border border-yellow-500/20 animate-ping opacity-25" />
            <div className="relative flex flex-col items-center animate-ultimate-splash text-center px-4 w-full max-w-lg">
              <div className="w-32 h-32 rounded-full border-4 border-yellow-400 overflow-hidden shadow-2xl shadow-yellow-500/40 bg-slate-900 mb-6">
                <img 
                  src={`/images/${ultimateSplash.heroId}.jpg`} 
                  alt=""
                  className="w-full h-full object-cover"
                  onError={(e) => { e.target.src = `/images/${ultimateSplash.heroId}.png` }}
                />
              </div>
              <div className="text-sm font-bold text-yellow-400 tracking-widest uppercase mb-1 drop-shadow">
                {ultimateSplash.heroName} Activated
              </div>
              <h2 className="text-4xl md:text-5xl font-black text-white uppercase tracking-tight drop-shadow-lg" style={{
                textShadow: '0 0 15px rgba(234,179,8,0.8), 0 0 30px rgba(234,179,8,0.4)'
              }}>
                {ultimateSplash.skillName}!
              </h2>
              <div className="mt-4 px-3 py-1 bg-yellow-400/20 text-yellow-300 border border-yellow-500/40 rounded-full text-xs font-semibold tracking-wider animate-pulse uppercase">
                ⭐ Ultimate Skill ⭐
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
