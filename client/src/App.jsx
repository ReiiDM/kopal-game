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

const ITEM_IMAGE_MAP = {
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

function getItemImageUrl(itemId) {
  const filename = ITEM_IMAGE_MAP[itemId]
  if (filename) {
    return `/images/${filename}`
  }
  const itemImageSeed = itemId ? itemId.replace(/[^a-zA-Z0-9]/g, '') : 'item'
  return `https://picsum.photos/seed/${itemImageSeed}/80/80`
}

function getHeroImageUrl(heroId) {
  if (!heroId) return `https://picsum.photos/seed/unknown/200/200`
  return `/images/${heroId}.jpg`
}

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
  const [isMobileTauntOpen, setIsMobileTauntOpen] = useState(false)
  const [isShaking, setIsShaking] = useState(false)
  const [ultimateSplash, setUltimateSplash] = useState(null)
  const [turnBanner, setTurnBanner] = useState(null)
  const [flashWhite, setFlashWhite] = useState(false)
  const [countdown, setCountdown] = useState(null)
  const [showBattleStartOverlay, setShowBattleStartOverlay] = useState(false)
  
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

  // Tracks players who have already received the death sound this match
  const deadPlayersRef = useRef(new Set())

  // Play a pre-recorded voice/sfx file (OGG)
  const playVoice = (filename, volume = 1.0) => {
    try {
      const audio = new Audio(`/${filename}`)
      audio.volume = volume
      audio.play().catch(() => {
        // Autoplay blocked — ignore silently
      })
    } catch (e) {
      // ignore
    }
  }

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
        case 'tick':
          oscillator.type = 'sine'
          oscillator.frequency.setValueAtTime(880, audioCtx.currentTime)
          oscillator.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.08)
          gainNode.gain.setValueAtTime(0.12, audioCtx.currentTime)
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1)
          oscillator.start(audioCtx.currentTime)
          oscillator.stop(audioCtx.currentTime + 0.1)
          break
        case 'battle-start':
          // Dramatic arcade start chime: rapid arpeggio
          const startNotes = [392, 523, 659, 784, 1047]
          startNotes.forEach((freq, i) => {
            const osc = audioCtx.createOscillator()
            const gain = audioCtx.createGain()
            osc.connect(gain)
            gain.connect(audioCtx.destination)
            osc.type = 'sawtooth'
            osc.frequency.setValueAtTime(freq, audioCtx.currentTime + i * 0.06)
            gain.gain.setValueAtTime(0.25, audioCtx.currentTime + i * 0.06)
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + i * 0.06 + 0.25)
            osc.start(audioCtx.currentTime + i * 0.06)
            osc.stop(audioCtx.currentTime + i * 0.06 + 0.25)
          })

          // Explosion sub-bass
          const subOsc = audioCtx.createOscillator()
          const subGain = audioCtx.createGain()
          subOsc.connect(subGain)
          subGain.connect(audioCtx.destination)
          subOsc.type = 'triangle'
          subOsc.frequency.setValueAtTime(120, audioCtx.currentTime + 0.3)
          subOsc.frequency.linearRampToValueAtTime(30, audioCtx.currentTime + 0.8)
          subGain.gain.setValueAtTime(0.4, audioCtx.currentTime + 0.3)
          subGain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.8)
          subOsc.start(audioCtx.currentTime + 0.3)
          subOsc.stop(audioCtx.currentTime + 0.8)
          break
      }
    } catch (e) {
      console.error('Sound error:', e)
    }
  }

  const [activeTaunts, setActiveTaunts] = useState({}) // { [socketId]: { text, id } }

  const triggerSpeechBubble = (socketId, text) => {
    console.log('triggerSpeechBubble called for socketId:', socketId, 'text:', text)
    if (!socketId) return
    const id = `${Date.now()}-${Math.random()}`
    setActiveTaunts((prev) => {
      const next = {
        ...prev,
        [socketId]: { text, id }
      }
      console.log('activeTaunts state updated to:', next)
      return next
    })
    
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

    function onMatchStarting(payload) {
      setCountdown(payload?.countdown ?? 3)
      setStatus(`Battle starting in ${payload?.countdown ?? 3}...`)
      playSound('tick')
    }

    function onMatchStartCancelled() {
      setCountdown(null)
      setHasSentReady(false)
      setStatus('Match start cancelled.')
    }

    function onMatchStarted(payload) {
      setCountdown(null)
      setMatchState(payload || null)
      setActionPending(false)
      setBattleLogs([])
      setShowWinnerModal(false)
      setStatus('Match started.')
      deadPlayersRef.current = new Set() // reset death tracking for new match

      // Trigger stunning battle start overlay
      setShowBattleStartOverlay(true)
      playSound('battle-start')
      setTimeout(() => {
        setShowBattleStartOverlay(false)
      }, 2500)
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

          // 🔊 SS voice-over
          playVoice('ss-audio.ogg', 0.9)
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

            // 🔊 Hurt voice-over when ANY hero takes damage
            playVoice('hurt-audio.ogg', 0.85)
            
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

      // 🔊 Died voice-over — fire once per player when their HP hits 0
      if (match?.players) {
        for (const p of match.players) {
          if ((p.hp ?? 1) <= 0 && !deadPlayersRef.current.has(p.playerIndex)) {
            deadPlayersRef.current.add(p.playerIndex)
            setTimeout(() => playVoice('died-audio.ogg', 1.0), 200)
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

    function onPlayerReadyCancelled() {
      setHasSentReady(false)
      setStatus('Ready status cancelled.')
    }

    function onReceiveTaunt(payload) {
      console.log('onReceiveTaunt client-side payload received:', payload, 'current client socket ID:', socket?.id)
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
    socket.on('player-ready-cancelled', onPlayerReadyCancelled)
    socket.on('match-starting', onMatchStarting)
    socket.on('match-start-cancelled', onMatchStartCancelled)

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
      socket.off('player-ready-cancelled', onPlayerReadyCancelled)
      socket.off('match-starting', onMatchStarting)
      socket.off('match-start-cancelled', onMatchStartCancelled)
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

  function handleCancelReady() {
    if (!socket) return
    socket.emit('cancel-ready')
    setStatus('Cancelling ready...')
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

  // Lock body scroll on mobile during battle
  useEffect(() => {
    if (page === 'battle') {
      document.body.classList.add('battle-active')
    } else {
      document.body.classList.remove('battle-active')
    }
    return () => document.body.classList.remove('battle-active')
  }, [page])

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

  // ── Battle BGM ──────────────────────────────────────────────────────────
  // Plays a looping 8-bar battle track (drums + bass + melody) via Web Audio.
  // Activates when `page === 'battle'` && `musicEnabled` && `!isMatchOver`.
  const battleBgmRef = useRef(null) // { audioCtx, masterGain, stopAll }

  useEffect(() => {
    const isBattleActive = page === 'battle' && !isMatchOver

    // ── Teardown helper ──────────────────────────────────────────────────
    function stopBgm(fadeMs = 400) {
      const bgm = battleBgmRef.current
      if (!bgm) return
      try {
        bgm.masterGain.gain.setTargetAtTime(0, bgm.audioCtx.currentTime, fadeMs / 1000 / 3)
        setTimeout(() => {
          try { bgm.stopAll() } catch (_) {}
          try { bgm.audioCtx.close() } catch (_) {}
        }, fadeMs + 100)
      } catch (_) {}
      battleBgmRef.current = null
    }

    if (!musicEnabled || !isBattleActive) {
      stopBgm(300)
      return
    }

    // ── Already running ──────────────────────────────────────────────────
    if (battleBgmRef.current) return

    // ── Create AudioContext ──────────────────────────────────────────────
    let audioCtx
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    } catch (e) { return }

    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {})
    }

    // Master gain (for fade in / out)
    const masterGain = audioCtx.createGain()
    masterGain.gain.setValueAtTime(0, audioCtx.currentTime)
    masterGain.gain.linearRampToValueAtTime(1, audioCtx.currentTime + 1.2)
    masterGain.connect(audioCtx.destination)

    const intervals = []
    const oscillators = []

    // ── Helper: schedule a short synth note ─────────────────────────────
    function schedNote(type, freq, startT, dur, vol, detune = 0) {
      try {
        const osc = audioCtx.createOscillator()
        const gain = audioCtx.createGain()
        osc.type = type
        osc.frequency.setValueAtTime(freq, startT)
        if (detune) osc.detune.setValueAtTime(detune, startT)
        gain.gain.setValueAtTime(vol, startT)
        gain.gain.exponentialRampToValueAtTime(0.0001, startT + dur)
        osc.connect(gain)
        gain.connect(masterGain)
        osc.start(startT)
        osc.stop(startT + dur + 0.01)
        oscillators.push(osc)
      } catch (_) {}
    }

    // ── Helper: kick drum (sub-bass thump) ──────────────────────────────
    function schedKick(t) {
      try {
        const osc = audioCtx.createOscillator()
        const gain = audioCtx.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(150, t)
        osc.frequency.exponentialRampToValueAtTime(40, t + 0.12)
        gain.gain.setValueAtTime(0.9, t)
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25)
        osc.connect(gain)
        gain.connect(masterGain)
        osc.start(t)
        osc.stop(t + 0.28)
        oscillators.push(osc)
      } catch (_) {}
    }

    // ── Helper: snare (noise burst) ──────────────────────────────────────
    function schedSnare(t) {
      try {
        const bufSize = audioCtx.sampleRate * 0.15
        const buffer = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate)
        const data = buffer.getChannelData(0)
        for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1
        const src = audioCtx.createBufferSource()
        src.buffer = buffer
        const filter = audioCtx.createBiquadFilter()
        filter.type = 'highpass'
        filter.frequency.value = 1500
        const gain = audioCtx.createGain()
        gain.gain.setValueAtTime(0.35, t)
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.15)
        src.connect(filter)
        filter.connect(gain)
        gain.connect(masterGain)
        src.start(t)
        src.stop(t + 0.16)
      } catch (_) {}
    }

    // ── Helper: hi-hat ───────────────────────────────────────────────────
    function schedHat(t, vol = 0.15) {
      try {
        const bufSize = audioCtx.sampleRate * 0.05
        const buffer = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate)
        const data = buffer.getChannelData(0)
        for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1
        const src = audioCtx.createBufferSource()
        src.buffer = buffer
        const filter = audioCtx.createBiquadFilter()
        filter.type = 'highpass'
        filter.frequency.value = 6000
        const gain = audioCtx.createGain()
        gain.gain.setValueAtTime(vol, t)
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05)
        src.connect(filter)
        filter.connect(gain)
        gain.connect(masterGain)
        src.start(t)
        src.stop(t + 0.06)
      } catch (_) {}
    }

    // ── BPM & timing ────────────────────────────────────────────────────
    const BPM = 138
    const beat = 60 / BPM         // seconds per beat
    const bar = beat * 4          // 4/4 time

    // ── Bass line (16-step pattern, loops every 2 bars) ──────────────────
    // Notes in Hz — A minor / Aeolian feel
    const bassPattern = [
      110, 0,   110, 0,   130.81, 0,  110,    0,
      146.83, 0, 110, 0,  164.81, 0,  146.83, 110
    ]

    // ── Melody line (32-step, loops every 4 bars) ─────────────────────── 
    // Energetic, battle-themed ascending/descending phrases
    const melodyPattern = [
      220,  0,    329.63, 0,     392,    0,     440,   329.63,
      392,  0,    349.23, 293.66, 261.63, 0,    329.63, 0,
      392,  0,    440,   493.88, 523.25, 440,  392,    0,
      349.23,293.66,261.63, 0,   220,    0,     246.94, 0
    ]

    // ── Counter to track beat position ───────────────────────────────────
    let scheduledUntil = audioCtx.currentTime + 0.1
    let bassStep = 0
    let melStep = 0
    let drumBeat = 0   // 0..7 (8 sub-beats per 2 beats)

    const LOOK_AHEAD = 0.15  // seconds ahead to schedule
    const SCHED_RATE = 80    // ms between scheduler runs

    const subBeat = beat / 2  // 8th notes for hi-hat

    function scheduler() {
      if (!audioCtx || audioCtx.state === 'closed') return
      const now = audioCtx.currentTime

      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {})
        return
      }

      while (scheduledUntil < now + LOOK_AHEAD) {
        const t = scheduledUntil

        // ── Drums (per 8th note) ─────────────────────────────────────────
        const beat4 = drumBeat % 8   // 0-7 (two beats, 8 8th-notes)
        if (beat4 === 0) schedKick(t)                        // beat 1
        if (beat4 === 4) schedKick(t)                        // beat 3  
        if (beat4 === 2 || beat4 === 6) schedSnare(t)        // beat 2 & 4
        schedHat(t, beat4 % 2 === 0 ? 0.14 : 0.07)          // 8th hi-hats

        // ── Bass (per 8th note, 16-step pattern) ────────────────────────
        const bFreq = bassPattern[bassStep % bassPattern.length]
        if (bFreq > 0) {
          schedNote('sawtooth', bFreq, t, subBeat * 0.85, 0.22)
          // sub-octave layer
          schedNote('sine', bFreq / 2, t, subBeat * 0.9, 0.18)
        }

        // ── Melody (per 8th note, 32-step pattern) ───────────────────────
        const mFreq = melodyPattern[melStep % melodyPattern.length]
        if (mFreq > 0) {
          schedNote('square', mFreq, t, subBeat * 0.7, 0.10)
          schedNote('triangle', mFreq * 2, t, subBeat * 0.5, 0.04, 8) // harmony
        }

        scheduledUntil += subBeat
        bassStep++
        melStep++
        drumBeat++
      }
    }

    const schedInterval = setInterval(scheduler, SCHED_RATE)
    intervals.push(schedInterval)

    battleBgmRef.current = {
      audioCtx,
      masterGain,
      stopAll: () => {
        intervals.forEach(id => clearInterval(id))
        oscillators.forEach(o => { try { o.disconnect() } catch (_) {} })
      }
    }

    return () => {
      stopBgm(500)
    }
  }, [page, musicEnabled, isMatchOver])

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
    <div className={`battle-root bg-slate-950 text-slate-100 ${page === 'battle' ? 'h-[100dvh] overflow-hidden flex flex-col' : 'min-h-full'}`}>
      <div className={`battle-inner mx-auto flex max-w-3xl flex-col px-4 sm:px-6 ${
        page === 'battle' ? 'h-full overflow-hidden' : 'min-h-full justify-center py-12'
      }`}>
        <header className={page === 'battle' ? 'mb-2 py-2 border-b border-slate-800/60' : 'mb-10'}>
          <div className="flex items-center justify-between gap-2">
            <h1 className={page === 'battle' ? 'text-lg font-semibold tracking-tight truncate' : 'text-3xl font-semibold tracking-tight'}>Kopal Battlefield</h1>
            <div className="text-sm flex items-center gap-2 flex-shrink-0">
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
                {musicEnabled ? '🎵' : '🔇'}
              </button>
              {page !== 'battle' && (
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
              )}
              <span className="text-emerald-400 font-bold text-xs">🏆 {wins}</span>
              <span className="text-slate-400 font-bold text-xs">💀 {losses}</span>
            </div>
          </div>
          {page !== 'battle' && (
            <p className="mt-2 text-sm text-slate-300">
              {page === 'setup'
                ? 'Setup your hero and items.'
                : 'Create a room or join an existing one.'}
            </p>
          )}
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

            {/* Team Display — 2-column side by side */}
            <div className="mt-4 grid grid-cols-2 gap-3">
              {/* Team 1 */}
              <div className="rounded-lg border border-red-800 bg-red-950/30 p-3">
                <div className="text-sm font-semibold text-red-300 mb-2">🔴 Team 1 ({roomPlayers.filter(p => p.team === 1).length}/2)</div>
                <div className="space-y-1 min-h-[2rem]">
                  {roomPlayers.filter(p => p.team === 1).length === 0 && (
                    <div className="text-xs text-slate-600 italic">Empty</div>
                  )}
                  {roomPlayers.filter(p => p.team === 1).map(p => (
                    <div key={p.socketId} className="relative flex items-center gap-1 py-0.5">
                      <div className={`text-xs ${p.isReady ? 'text-emerald-300' : 'text-slate-400'}`}>
                        {p.isReady ? '✅' : '⏳'} {p.socketId === socketId ? 'You' : 'Player'}
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
              <div className="rounded-lg border border-blue-800 bg-blue-950/30 p-3">
                <div className="text-sm font-semibold text-blue-300 mb-2">🔵 Team 2 ({roomPlayers.filter(p => p.team === 2).length}/2)</div>
                <div className="space-y-1 min-h-[2rem]">
                  {roomPlayers.filter(p => p.team === 2).length === 0 && (
                    <div className="text-xs text-slate-600 italic">Empty</div>
                  )}
                  {roomPlayers.filter(p => p.team === 2).map(p => (
                    <div key={p.socketId} className="relative flex items-center gap-1 py-0.5">
                      <div className={`text-xs ${p.isReady ? 'text-emerald-300' : 'text-slate-400'}`}>
                        {p.isReady ? '✅' : '⏳'} {p.socketId === socketId ? 'You' : 'Player'}
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

            {/* Switch Team Button — centered below the 2 columns */}
            {!hasSentReady ? (
              <div className="mt-3 flex justify-center">
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-gradient-to-r from-slate-600 to-slate-700 hover:from-slate-500 hover:to-slate-600 text-white font-medium text-sm rounded-lg transition-all duration-300 active:scale-95"
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
                  <div className="text-sm font-semibold flex items-center gap-2 mb-3">
                    <span className="w-6 h-6 rounded-full bg-indigo-500 text-white flex items-center justify-center text-xs">1</span>
                    Select Your Hero
                    <span className="ml-auto text-xs text-slate-500 font-normal">{Object.values(heroes).length} heroes</span>
                  </div>

                  {/* Responsive profile card grid: 2 cols on mobile, 3 on sm+ */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {Object.values(heroes).map((h) => (
                      <button
                        key={h.id}
                        type="button"
                        onClick={() => setSelectedHeroId(selectedHeroId === h.id ? '' : h.id)}
                        disabled={hasSentReady}
                        className={`flex flex-col items-center gap-2 rounded-xl border p-3 text-center transition-all duration-200 ${
                          selectedHeroId === h.id
                            ? 'border-indigo-500 bg-indigo-500/15 shadow-[0_0_14px_rgba(99,102,241,0.3)] scale-[1.03]'
                            : 'border-slate-700 bg-slate-950/40 hover:bg-slate-900/60 hover:border-slate-600'
                        } ${hasSentReady ? 'opacity-50 cursor-not-allowed pointer-events-none' : 'cursor-pointer'}`}
                      >
                        {/* Profile Image */}
                        <div className={`w-12 h-12 sm:w-16 sm:h-16 rounded-full border-2 overflow-hidden bg-slate-800 flex items-center justify-center flex-shrink-0 ${
                          selectedHeroId === h.id ? 'border-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.5)]' : 'border-slate-600'
                        }`}>
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
                          <div className="w-full h-full flex items-center justify-center text-xl text-slate-400" style={{ display: 'none' }}>
                            {h.name.charAt(0)}
                          </div>
                        </div>
                        <div className="text-xs font-semibold text-slate-200 leading-tight">{h.name}</div>
                        <div className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                          h.role === 'Fighter' ? 'bg-orange-500/20 text-orange-300' :
                          h.role === 'Tank' ? 'bg-blue-500/20 text-blue-300' :
                          h.role === 'Assassin' ? 'bg-red-500/20 text-red-300' :
                          h.role === 'Burst' ? 'bg-yellow-500/20 text-yellow-300' :
                          'bg-purple-500/20 text-purple-300'
                        }`}>{h.role}</div>
                        {selectedHeroId === h.id && (
                          <div className="text-emerald-400 text-base leading-none">✓</div>
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Fighter detail panel — shown when a fighter is selected */}
                  {selectedHero && (
                    <div className="mt-4 rounded-lg border border-indigo-800/60 bg-indigo-950/20 p-3 sm:p-4">
                      {/* Hero detail header */}
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full border-2 border-indigo-400 overflow-hidden bg-slate-800 flex-shrink-0">
                          <img
                            src={`/images/${selectedHero.id}.jpg`}
                            alt={selectedHero.name}
                            className="w-full h-full object-cover"
                            onError={(e) => { e.target.src = `https://picsum.photos/seed/${selectedHero.id}/100/100` }}
                          />
                        </div>
                        <div>
                          <div className="text-base font-bold text-slate-100">{selectedHero.name}</div>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                              selectedHero.role === 'Fighter' ? 'bg-orange-500/20 text-orange-300' :
                              selectedHero.role === 'Tank' ? 'bg-blue-500/20 text-blue-300' :
                              selectedHero.role === 'Assassin' ? 'bg-red-500/20 text-red-300' :
                              selectedHero.role === 'Burst' ? 'bg-yellow-500/20 text-yellow-300' :
                              'bg-purple-500/20 text-purple-300'
                            }`}>⚔️ {selectedHero.role}</span>
                            <span className="text-xs text-slate-400">❤️ {selectedHero.baseHP} HP</span>
                          </div>
                        </div>
                      </div>

                      {/* Normal Attack */}
                      <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3 mb-2">
                        <div className="text-xs font-semibold text-indigo-300 mb-1">⚔️ Normal Attack — {selectedHero.normalAttack?.name}</div>
                        {selectedHero.normalAttack?.description && (
                          <div className="text-xs text-slate-400 mb-1">{selectedHero.normalAttack.description}</div>
                        )}
                        <div className="space-y-0.5">
                          {effectDetailLines(selectedHero.normalAttack?.effect).map((line) => (
                            <div key={line} className="text-xs text-slate-500">{line}</div>
                          ))}
                        </div>
                      </div>

                      {/* Skills */}
                      <div className="grid gap-2 sm:grid-cols-2">
                        {(selectedHero.skills || []).map((s) => (
                          <div key={s.name} className="rounded-lg border border-slate-700 bg-slate-950/50 p-3">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <div className="font-semibold text-xs text-slate-200 flex items-center gap-1">
                                {s.type === 'ultimate' && <span className="text-yellow-400">⭐</span>}
                                {s.name}
                              </div>
                              <div className={`text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                                s.type === 'ultimate' ? 'bg-yellow-500/20 text-yellow-300' :
                                s.type === 'defense' ? 'bg-blue-500/20 text-blue-300' :
                                s.type === 'utility' ? 'bg-purple-500/20 text-purple-300' :
                                'bg-red-500/20 text-red-300'
                              }`}>{s.type} • CD {s.cooldown}</div>
                            </div>
                            {s.description && (
                              <div className="text-xs text-slate-400 mb-1">{s.description}</div>
                            )}
                            <div className="space-y-0.5">
                              {effectDetailLines(s.effect).map((line) => (
                                <div key={line} className="text-xs text-slate-500">{line}</div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

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
                      const disabled = hasSentReady || (!checked && selectedItemIds.length >= 3)
                      
                      const itemImage = getItemImageUrl(it.id)
                      
                      return (
                        <label
                          key={it.id}
                          className={`relative flex flex-col cursor-pointer items-center gap-2 rounded-lg border px-2 py-3 text-sm transition-all ${
                            checked
                              ? 'border-emerald-500 bg-emerald-500/10 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                              : 'border-slate-800 bg-slate-950/30 hover:bg-slate-900/40'
                          } ${disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
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

                  {/* Ready / Cancel Ready Button Panel */}
                  {selectedItemIds.length === 3 && (
                    <div className="mt-4 flex flex-col gap-2">
                      {!hasSentReady ? (
                        <button
                          type="button"
                          className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-bold text-lg rounded-xl transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-emerald-500/30"
                          onClick={handleReady}
                          disabled={!isConnected || !selectedHero}
                        >
                          🎉 I'm Ready!
                        </button>
                      ) : (
                        <div className="flex flex-col gap-2">
                          <button
                            type="button"
                            className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-slate-800 text-slate-400 font-semibold text-base rounded-xl border border-slate-700 cursor-not-allowed"
                            disabled
                          >
                            ⏳ Waiting for other players...
                          </button>
                          <button
                            type="button"
                            className="w-full inline-flex items-center justify-center gap-2 px-6 py-2 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white font-bold text-base rounded-xl transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98]"
                            onClick={handleCancelReady}
                          >
                            ❌ Cancel Ready
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        ) : null}

        {page === 'battle' ? (
          <>
            <section className={`battle-section flex-1 overflow-y-auto rounded-xl border border-slate-800 bg-slate-900/40 p-2 sm:p-4 md:p-6 pb-24 md:pb-6 mt-1 md:mt-4 transition-all duration-300 ${isShaking ? 'animate-shake' : ''}`}>
              <div className="grid gap-2 md:gap-6">
                <div className="rounded-lg border border-slate-800 bg-slate-950/30 p-2 sm:p-4">
                  <div className="flex flex-wrap items-center justify-between gap-1 sm:gap-3">
                    <div className="text-xs sm:text-sm font-semibold">
                      Turn {turnNumber} • {formatPlayerLabel(currentTurnPlayerIndex, (matchState.players || []).find(p => p.playerIndex === currentTurnPlayerIndex)?.team)}'s turn
                      {isMatchOver ? ' • match over' : ''}
                    </div>
                    <div className="text-[10px] sm:text-xs text-slate-300">
                      {myPlayerIndex ? `You: ${formatPlayerLabel(myPlayerIndex, (matchState.players || []).find(p => p.playerIndex === myPlayerIndex)?.team)}` : ''}
                      {isMyTurn && !isMatchOver ? ' \u2022 your move' : ''}
                      {actionPending ? ' \u2022 resolving\u2026' : ''}
                    </div>
                  </div>
                  {turnDamageBoostPct > 0 ? (
                    <div className="mt-2 text-xs text-amber-300 font-bold animate-pulse">
                      ⚡ Damage boost active: +{Math.round(turnDamageBoostPct * 100)}%
                    </div>
                  ) : null}
                </div>

                {/* Players: 2-col on mobile (2×2 grid), 4-col on lg */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-4">
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
                        className="relative"
                        style={{ aspectRatio: '3/4' }}
                      >
                        {/* Battle Speech Bubble — rendered inside card so it is never clipped */}
                        {activeTaunts[p.socketId] && (
                          <div className="absolute top-1 left-0 right-0 flex justify-center z-40 pointer-events-none">
                            <div className="animate-bounce bg-white text-slate-950 px-2 py-1.5 rounded-xl text-[10px] font-black shadow-2xl border-2 border-slate-950 max-w-[90%] text-center break-words leading-tight">
                              {activeTaunts[p.socketId].text}
                            </div>
                          </div>
                        )}

                        <div
                          className={`w-full h-full rounded-lg border overflow-hidden transition-all duration-300 ${
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
                          {/* Hero image fills the full card */}
                          <img
                            src={heroImagePath}
                            alt={p.heroName || 'Hero'}
                            className="absolute inset-0 w-full h-full object-cover object-top"
                            style={isStunned ? { filter: 'brightness(0.5) saturate(0.3)' } : {}}
                            onError={(e) => {
                              e.target.src = `/images/${p.heroId}.png`
                              e.target.onerror = (e2) => {
                                e2.target.src = placeholderImage
                                e2.target.onerror = (e3) => {
                                  e3.target.style.display = 'none'
                                }
                              }
                            }}
                          />

                          {/* Dark gradient overlay — bottom 60% for readability */}
                          <div className="absolute inset-0 pointer-events-none"
                            style={{ background: 'linear-gradient(to top, rgba(2,6,23,0.95) 0%, rgba(2,6,23,0.6) 45%, rgba(2,6,23,0.1) 75%, transparent 100%)' }}
                          />

                          {/* Stun yellow tint overlay */}
                          {isStunned && (
                            <div
                              className="absolute inset-0 pointer-events-none z-10"
                              style={{ background: 'rgba(234,179,8,0.18)', animation: 'stunFlicker 0.9s ease-in-out infinite' }}
                            />
                          )}

                          {/* ⚡ Stun badge center */}
                          {isStunned && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
                              <span style={{ fontSize: '2.5rem', lineHeight: 1, filter: 'drop-shadow(0 0 8px rgba(234,179,8,1))', animation: 'stunFlicker 0.8s ease-in-out infinite' }}>⚡</span>
                            </div>
                          )}

                          {/* Item icons — top right */}
                          <div className="absolute top-1.5 right-1.5 flex gap-0.5 flex-wrap justify-end max-w-[60px] z-20">
                            {Array.isArray(p.itemIds) && p.itemIds.map((itemId) => (
                              <div key={itemId} className="w-5 h-5 rounded border border-slate-600/60 overflow-hidden bg-slate-800/80 flex items-center justify-center">
                                <img src={getItemImageUrl(itemId)} alt="" className="w-full h-full object-cover" />
                              </div>
                            ))}
                          </div>

                          {/* Damage / heal float numbers */}
                          {playerEffects.length > 0 && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
                              <div className="flex flex-col items-center gap-1">
                                {playerEffects.map((effect, i) => {
                                  const colors = { damage: '#f87171', heal: '#4ade80', shield: '#38bdf8', miss: '#fde68a', dodge: '#fde68a', stun: '#fde047' }
                                  const color = colors[effect.type] || '#fff'
                                  return (
                                    <div key={effect.id} style={{
                                      color, fontWeight: 'bold',
                                      fontSize: effect.type === 'stun' ? '1rem' : '1.25rem',
                                      textShadow: `0 0 8px ${color}, 0 2px 4px rgba(0,0,0,0.8)`,
                                      animation: 'floatUp 1.5s ease-out forwards',
                                      animationDelay: `${i * 0.06}s`,
                                      opacity: 0, whiteSpace: 'nowrap'
                                    }}>
                                      {effect.text}
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )}

                          {/* "Your turn" glow top strip */}
                          {isCurrentTurn && !isStunned && (
                            <div className="absolute top-0 left-0 right-0 h-1 z-20"
                              style={{ background: 'linear-gradient(to right, transparent, rgba(99,102,241,0.9), transparent)' }}
                            />
                          )}

                          {/* Stats overlay — pinned to bottom */}
                          <div className="absolute bottom-0 left-0 right-0 z-20 px-2 pb-2 pt-1">
                            {/* Name row */}
                            <div className="flex items-center justify-between gap-1 mb-1">
                              <div className="min-w-0">
                                <div className="text-[10px] sm:text-xs font-bold text-white leading-tight truncate drop-shadow">
                                  {p.heroName || '—'} {isSelf ? <span className="text-indigo-300">(You)</span> : ''}
                                </div>
                              </div>
                              <div className="flex-shrink-0 font-mono">
                                <span className={`text-[10px] sm:text-xs font-bold drop-shadow ${hpPct < 30 ? 'text-red-400' : 'text-emerald-400'}`}>
                                  {Math.max(0, p.hp || 0)}
                                </span>
                                {p.shield ? <span className="ml-1 text-[10px] text-sky-300">🛡{p.shield}</span> : ''}
                              </div>
                            </div>

                            {/* HP bar */}
                            <div className="h-1.5 sm:h-2 rounded-full overflow-hidden bg-slate-900/60 border border-slate-700/40">
                              <div className="flex h-full w-full">
                                <div className="h-full transition-all duration-500 rounded-full"
                                  style={{ width: `${hpPct}%`, background: hpPct < 30 ? '#ef4444' : hpPct < 60 ? '#eab308' : '#22c55e' }} />
                                {barShieldPct > 0 && (
                                  <div className="h-full bg-sky-400 transition-all duration-500" style={{ width: `${barShieldPct}%` }} />
                                )}
                              </div>
                            </div>

                            {/* Effect badges (compact) */}
                            {p.effects && typeof p.effects === 'object' && (
                              <div className="mt-1 flex flex-wrap gap-0.5">
                                {p.effects.stunTurns > 0 && (
                                  <span className="text-[9px] px-1 py-0.5 rounded font-bold" style={{ background: 'rgba(234,179,8,0.25)', color: '#fde047', animation: 'stunGlow 0.9s ease-in-out infinite' }}>⚡{p.effects.stunTurns}t</span>
                                )}
                                {p.effects.stunChancePctTurns > 0 && (
                                  <span className="text-[9px] px-1 py-0.5 rounded font-bold bg-orange-500/20 text-orange-300">🏋️{p.effects.stunChancePctTurns}t</span>
                                )}
                                {p.effects.attack?.pct < 0 && (
                                  <span className="text-[9px] px-1 py-0.5 rounded bg-red-500/20 text-red-300">📉{Math.abs(p.effects.attack.pct * 100)}%</span>
                                )}
                                {p.effects.attack?.pct > 0 && (
                                  <span className="text-[9px] px-1 py-0.5 rounded bg-green-500/20 text-green-300">📈{p.effects.attack.pct * 100}%</span>
                                )}
                                {p.effects.dodgeAllTurns > 0 && <span className="text-[9px] px-1 py-0.5 rounded bg-purple-500/20 text-purple-300">🌀{p.effects.dodgeAllTurns}t</span>}
                                {p.effects.immunityTurns > 0 && <span className="text-[9px] px-1 py-0.5 rounded bg-cyan-500/20 text-cyan-300">🛡️</span>}
                                {p.effects.damageReduction && <span className="text-[9px] px-1 py-0.5 rounded bg-indigo-500/20 text-indigo-300">🛡+{p.effects.damageReduction.pct * 100}%</span>}
                                {p.effects.reflect && <span className="text-[9px] px-1 py-0.5 rounded bg-pink-500/20 text-pink-300">🔄</span>}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Target selection (for 2v2) — desktop only */}
                {enemyPlayers.length > 1 && (
                  <div className="hidden md:block rounded-lg border border-slate-800 bg-slate-950/30 p-4 mb-4">
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

            {/* Floating Trashtalk Arrow Drawer — visible on ALL screen sizes on battle page */}
            <div className={`fixed right-0 top-1/2 -translate-y-1/2 z-50 flex items-center transition-transform duration-300 ${
              isMobileTauntOpen ? 'translate-x-0' : 'translate-x-[240px]'
            }`}>
              {/* Toggle Button (Arrow) */}
              <button
                type="button"
                onClick={() => setIsMobileTauntOpen(!isMobileTauntOpen)}
                className="bg-gradient-to-b from-indigo-500 to-indigo-700 hover:from-indigo-400 hover:to-indigo-600 active:scale-95 text-white rounded-l-2xl p-3.5 shadow-2xl border-y border-l border-indigo-400/40 flex items-center justify-center transition-all duration-200 focus:outline-none"
                style={{ width: '46px', height: '54px' }}
                aria-label="Toggle Quick Chat"
              >
                {isMobileTauntOpen ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-indigo-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-indigo-100 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                )}
              </button>

              {/* Quick Chat Menu Panel */}
              <div className="bg-slate-900/95 backdrop-blur-md border-y border-l border-slate-700/60 rounded-l-2xl p-3 shadow-2xl flex flex-col gap-2 w-[220px]">
                <div className="text-xs font-black text-indigo-400 uppercase tracking-widest mb-1 pb-1.5 border-b border-slate-800 flex items-center gap-1.5">
                  <span className="animate-bounce">💬</span> Trash Talk
                </div>
                {QUICK_TAUNTS.map((taunt) => (
                  <button
                    key={taunt}
                    type="button"
                    onClick={() => {
                      if (socket) {
                        socket.emit('send-taunt', { tauntText: taunt })
                      }
                      setIsMobileTauntOpen(false)
                    }}
                    className="w-full text-left px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-semibold rounded-xl border border-slate-700/50 hover:border-indigo-500/45 transition-all active:scale-95 duration-100 shadow-sm"
                  >
                    {taunt}
                  </button>
                ))}
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

        {/* Pre-battle starting countdown screen */}
        {countdown !== null && (
          <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/95 backdrop-blur-xl p-4 md:p-8 overflow-y-auto">
            {/* Ambient Background Glows */}
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-red-600/10 rounded-full blur-3xl pointer-events-none animate-pulse animate-infinite" />
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none animate-pulse animate-infinite" />
            
            <div className="w-full max-w-5xl flex flex-col gap-6 md:gap-8 relative z-10">
              {/* Header */}
              <div className="text-center">
                <div className="inline-block px-4 py-1.5 bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-bold uppercase tracking-widest rounded-full animate-pulse">
                  ⚔️ GET READY FOR THE MATCH ⚔️
                </div>
                <h2 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tight mt-2">
                  Match is Starting!
                </h2>
              </div>

              {/* VS Panel */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                {/* Team 1 (Left) */}
                <div className="md:col-span-5 bg-gradient-to-br from-red-950/40 to-slate-900/50 border border-red-500/30 rounded-2xl p-6 shadow-2xl backdrop-blur-md animate-vs-slide-left">
                  <h3 className="text-rose-400 text-center font-black tracking-wider uppercase mb-4 text-lg border-b border-rose-500/20 pb-2">
                    🔴 TEAM A
                  </h3>
                  <div className="flex flex-col gap-4 justify-center">
                    {roomPlayers.filter(p => p.team === 1).map((p, idx) => {
                      const hero = heroes[p.heroId]
                      return (
                        <div key={p.socketId || idx} className="flex items-center gap-4 bg-slate-950/40 p-3 rounded-xl border border-slate-800">
                          <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-rose-500 bg-slate-800 flex-shrink-0">
                            <img 
                              src={getHeroImageUrl(p.heroId)} 
                              alt="" 
                              className="w-full h-full object-cover"
                              onError={(e) => { e.target.src = `https://picsum.photos/seed/${p.heroId || 'tan'}/200/200` }}
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-black text-white truncate text-base">
                              {hero?.name || 'Selecting...'}
                            </div>
                            <div className="text-xs text-slate-400 capitalize">
                              {hero?.role || 'Hero'}
                            </div>
                            {/* Selected Items */}
                            <div className="flex gap-1.5 mt-1">
                              {Array.isArray(p.itemIds) && p.itemIds.map((itemId, i) => (
                                <div key={i} className="w-5 h-5 rounded border border-slate-700 overflow-hidden bg-slate-900" title={itemId}>
                                  <img src={getItemImageUrl(itemId)} alt="" className="w-full h-full object-cover" />
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                    {roomPlayers.filter(p => p.team === 1).length === 0 && (
                      <div className="text-center py-6 text-sm text-slate-500 italic">No players on Team A</div>
                    )}
                  </div>
                </div>

                {/* VS & Timer (Center) */}
                <div className="md:col-span-2 flex flex-col items-center justify-center py-4 relative">
                  {/* Glowing VS Circle */}
                  <div className="relative w-28 h-28 md:w-32 md:h-32 flex items-center justify-center rounded-full bg-slate-900 border border-slate-800 shadow-2xl">
                    <div className="absolute inset-0 rounded-full border border-indigo-500/20 animate-ping" />
                    <div className="absolute inset-2 rounded-full border border-yellow-500/30 animate-pulse" />
                    
                    {/* Pulsing countdown number */}
                    <div key={countdown} className="text-7xl md:text-8xl font-black text-yellow-400 font-mono animate-countdown-tick drop-shadow-[0_0_15px_rgba(234,179,8,0.7)] select-none">
                      {countdown}
                    </div>
                  </div>
                  <div className="mt-4 text-xs font-semibold text-yellow-500 uppercase tracking-widest text-center animate-pulse">
                    ⚡ Humanda sa Bakbakan! ⚡
                  </div>
                </div>

                {/* Team 2 (Right) */}
                <div className="md:col-span-5 bg-gradient-to-br from-blue-950/40 to-slate-900/50 border border-blue-500/30 rounded-2xl p-6 shadow-2xl backdrop-blur-md animate-vs-slide-right">
                  <h3 className="text-blue-400 text-center font-black tracking-wider uppercase mb-4 text-lg border-b border-blue-500/20 pb-2">
                    🔵 TEAM B
                  </h3>
                  <div className="flex flex-col gap-4 justify-center">
                    {roomPlayers.filter(p => p.team === 2).map((p, idx) => {
                      const hero = heroes[p.heroId]
                      return (
                        <div key={p.socketId || idx} className="flex items-center gap-4 bg-slate-950/40 p-3 rounded-xl border border-slate-800">
                          <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-blue-500 bg-slate-800 flex-shrink-0">
                            <img 
                              src={getHeroImageUrl(p.heroId)} 
                              alt="" 
                              className="w-full h-full object-cover"
                              onError={(e) => { e.target.src = `https://picsum.photos/seed/${p.heroId || 'tan'}/200/200` }}
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-black text-white truncate text-base">
                              {hero?.name || 'Selecting...'}
                            </div>
                            <div className="text-xs text-slate-400 capitalize">
                              {hero?.role || 'Hero'}
                            </div>
                            {/* Selected Items */}
                            <div className="flex gap-1.5 mt-1">
                              {Array.isArray(p.itemIds) && p.itemIds.map((itemId, i) => (
                                <div key={i} className="w-5 h-5 rounded border border-slate-700 overflow-hidden bg-slate-900" title={itemId}>
                                  <img src={getItemImageUrl(itemId)} alt="" className="w-full h-full object-cover" />
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                    {roomPlayers.filter(p => p.team === 2).length === 0 && (
                      <div className="text-center py-6 text-sm text-slate-500 italic">No players on Team B</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Cancel Button */}
              <div className="flex justify-center mt-4">
                <button
                  type="button"
                  onClick={handleCancelReady}
                  className="px-10 py-4 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white font-black text-lg rounded-2xl transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-xl shadow-rose-600/30 border border-rose-500/30 flex items-center gap-2 group"
                >
                  <span className="group-hover:rotate-90 transition-transform duration-300">❌</span> CANCEL MATCH
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Stunning BATTLE START Overlay */}
        {showBattleStartOverlay && (
          <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/95 overflow-hidden">
            {/* Fullscreen fast white flash overlay */}
            <div className="absolute inset-0 bg-white z-50 animate-flash-white pointer-events-none" />

            {/* Split panels background */}
            <div className="absolute inset-0 flex flex-col md:flex-row pointer-events-none">
              {/* Left Side Red Panel */}
              <div className="flex-1 bg-gradient-to-r from-red-950/80 via-red-900/60 to-transparent border-r border-red-500/20 animate-vs-slide-left" />
              {/* Right Side Blue Panel */}
              <div className="flex-1 bg-gradient-to-l from-blue-950/80 via-blue-900/60 to-transparent border-l border-blue-500/20 animate-vs-slide-right" />
            </div>

            {/* Content Container */}
            <div className="relative w-full max-w-6xl px-4 flex flex-col items-center z-20">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-8 w-full items-center">
                {/* Team 1 Heroes (Left) */}
                <div className="md:col-span-5 flex flex-col gap-6 items-end md:pr-12 animate-vs-slide-left">
                  {(matchState?.players || []).filter(p => p.team === 1).map((p, idx) => (
                    <div key={p.playerIndex || idx} className="flex items-center gap-4 bg-gradient-to-l from-red-900/30 to-black/60 p-4 rounded-2xl border border-red-500/30 shadow-2xl w-full max-w-sm">
                      <div className="flex-1 text-right min-w-0">
                        <div className="text-rose-400 font-extrabold text-xs tracking-wider uppercase">TEAM A</div>
                        <h4 className="font-black text-2xl text-white truncate italic uppercase tracking-tighter">
                          {p.heroName || 'Hero'}
                        </h4>
                        <div className="flex gap-1 justify-end mt-2">
                          {Array.isArray(p.itemIds) && p.itemIds.map((itemId, i) => (
                            <div key={i} className="w-5 h-5 rounded border border-slate-700 overflow-hidden bg-slate-900" title={itemId}>
                              <img src={getItemImageUrl(itemId)} alt="" className="w-full h-full object-cover" />
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="w-20 h-20 rounded-2xl overflow-hidden border-2 border-red-500 shadow-lg shadow-red-500/20 bg-slate-800 flex-shrink-0 transform rotate-3">
                        <img 
                          src={getHeroImageUrl(p.heroId)} 
                          alt="" 
                          className="w-full h-full object-cover scale-110" 
                          onError={(e) => { e.target.src = `https://picsum.photos/seed/${p.heroId || 'tan'}/200/200` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* VS Slam Badge (Center) */}
                <div className="md:col-span-2 flex flex-col items-center justify-center animate-vs-badge-slam py-4">
                  <div className="relative w-24 h-24 md:w-28 md:h-28 flex items-center justify-center rounded-full bg-gradient-to-b from-yellow-300 to-amber-500 border-4 border-white shadow-[0_0_30px_rgba(234,179,8,0.6)]">
                    <span className="text-4xl md:text-5xl font-black text-slate-950 italic tracking-tighter animate-pulse">VS</span>
                    <div className="absolute inset-0 rounded-full border border-yellow-300 animate-ping opacity-30" />
                  </div>
                </div>

                {/* Team 2 Heroes (Right) */}
                <div className="md:col-span-5 flex flex-col gap-6 items-start md:pl-12 animate-vs-slide-right">
                  {(matchState?.players || []).filter(p => p.team === 2).map((p, idx) => (
                    <div key={p.playerIndex || idx} className="flex items-center gap-4 bg-gradient-to-r from-blue-900/30 to-black/60 p-4 rounded-2xl border border-blue-500/30 shadow-2xl w-full max-w-sm">
                      <div className="w-20 h-20 rounded-2xl overflow-hidden border-2 border-blue-500 shadow-lg shadow-blue-500/20 bg-slate-800 flex-shrink-0 transform -rotate-3">
                        <img 
                          src={getHeroImageUrl(p.heroId)} 
                          alt="" 
                          className="w-full h-full object-cover scale-110"
                          onError={(e) => { e.target.src = `https://picsum.photos/seed/${p.heroId || 'tan'}/200/200` }}
                        />
                      </div>
                      <div className="flex-1 text-left min-w-0">
                        <div className="text-blue-400 font-extrabold text-xs tracking-wider uppercase">TEAM B</div>
                        <h4 className="font-black text-2xl text-white truncate italic uppercase tracking-tighter">
                          {p.heroName || 'Hero'}
                        </h4>
                        <div className="flex gap-1 justify-start mt-2">
                          {Array.isArray(p.itemIds) && p.itemIds.map((itemId, i) => (
                            <div key={i} className="w-5 h-5 rounded border border-slate-700 overflow-hidden bg-slate-900" title={itemId}>
                              <img src={getItemImageUrl(itemId)} alt="" className="w-full h-full object-cover" />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* BATTLE START Text Impact Banner */}
              <div className="mt-16 text-center animate-battle-start-impact relative">
                <div className="absolute inset-0 bg-yellow-500/30 rounded-full blur-3xl scale-125 pointer-events-none" />
                <div className="relative">
                  <div className="text-yellow-400 font-black tracking-widest text-lg md:text-xl uppercase mb-3 drop-shadow animate-bounce">
                    ⚡ ROUND 1 ⚡
                  </div>
                  <h1 className="text-6xl md:text-8xl font-black text-white italic tracking-tighter uppercase leading-none drop-shadow-[0_8px_25px_rgba(234,179,8,0.5)]" style={{
                    textShadow: '0 0 30px rgba(234,179,8,0.9), 0 0 60px rgba(245,158,11,0.5), 0 0 100px rgba(245,158,11,0.3)'
                  }}>
                    BATTLE START!
                  </h1>
                  <p className="mt-4 text-sm md:text-base font-extrabold text-yellow-300 uppercase tracking-widest animate-pulse">
                    ⚔️ Walang Atrasan! Bakbakan Na! ⚔️
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
