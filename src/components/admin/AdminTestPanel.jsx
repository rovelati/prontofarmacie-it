import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, getAdminSupabaseClient } from '@/lib/supabaseClient.ts'
import { useToast } from '@/components/ui/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import {
  Loader2,
  Users,
  ListTree,
  Stethoscope,
  Menu,
  RefreshCcw,
  Save,
  Upload,
  Plus,
  X,
  AlertTriangle,
  Search,
  Trash2,
  FileSpreadsheet,
  Copy,
  ExternalLink,
  BarChart3,
  CheckCircle2,
  MessageSquare,
  Brain,
  Globe,
  MapPin,
  Sparkles,
  Calendar,
  CalendarX,
  Clock,
  Package,
  ArrowRight,
  Inbox,
  ShieldCheck,
} from 'lucide-react'
import AdminJobApprovals from '@/components/admin/AdminJobApprovals'

const NAV_ITEMS = [
  { id: 'stats', label: 'Statistiche', description: 'Panoramica database', icon: BarChart3 },
  { id: 'users', label: 'Utenti', description: 'Registrati e ruoli', icon: Users },
  { id: 'claims', label: 'Claim', description: 'Richieste farmacie', icon: CheckCircle2 },
  { id: 'jobs', label: 'Offerte', description: 'Approvazione annunci', icon: Inbox },
  { id: 'turni-updates', label: 'Aggiornamenti Turno', description: 'Health check fonti turno', icon: Clock },
  { id: 'pharmacies', label: 'Farmacie', description: 'Ricerca e editing', icon: Stethoscope },
  { id: 'taxonomy', label: 'Tassonomia', description: 'Servizi e prezzi', icon: ListTree },
]

const ROLE_OPTIONS = [
  { value: 'user', label: 'Utente' },
  { value: 'editor', label: 'Editor' },
  { value: 'admin', label: 'Admin' },
]

const TURNI_CADENCE_HOURS = {
  'federfarma-lombardia': 2,
  'ordine-farmacisti-venezia': 24,
  'ordine-farmacisti-caltanissetta': 12,
  'ordine-farmacisti-roma': 12,
  'aulss9-verona': 24,
  'ordine-farmacisti-messina': 24,
}

const getExpectedCadenceHours = (slug) => {
  if (!slug) return 24
  if (TURNI_CADENCE_HOURS[slug]) return TURNI_CADENCE_HOURS[slug]
  if (slug.startsWith('pharmaround-turni-')) return 12
  return 24
}

// Componente helper per i bottoni di arricchimento singolo
const EnrichmentDialogButton = ({ 
  title, 
  description, 
  icon, 
  command, 
  endpoint,
  pharmacyId,
  extraData = {},
  toast, 
  disabled = false,
  onSuccess = null // Callback chiamato dopo successo
}) => {
  const [isRunning, setIsRunning] = React.useState(false)
  const [result, setResult] = React.useState(null)
  const [showResult, setShowResult] = React.useState(false)
  const [apiAvailable, setApiAvailable] = React.useState(null) // null = checking, true/false = checked
  
  const API_BASE_URL = import.meta.env.VITE_API_SERVER_URL || 'http://localhost:5001'
  
  // Verifica se il server API è disponibile
  React.useEffect(() => {
    if (!endpoint) return
    
    const checkApi = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/health`, {
          method: 'GET',
          signal: AbortSignal.timeout(2000) // 2 secondi timeout
        })
        setApiAvailable(response.ok)
      } catch (error) {
        setApiAvailable(false)
      }
    }
    
    checkApi()
    // Ricontrolla ogni 30 secondi
    const interval = setInterval(checkApi, 30000)
    return () => clearInterval(interval)
  }, [endpoint, API_BASE_URL])
  
  const handleRun = async () => {
    if (!endpoint || !pharmacyId) {
      toast({ 
        variant: 'destructive', 
        title: 'Errore', 
        description: 'Endpoint o pharmacy_id mancanti' 
      })
      return
    }
    
    setIsRunning(true)
    setResult(null)
    setShowResult(true)
    
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pharmacy_id: pharmacyId,
          ...extraData
        }),
      })
      
      const data = await response.json()
      setResult(data)
      
      if (data.success) {
        toast({ 
          title: '✅ Arricchimento completato', 
          description: `${title} eseguito con successo` 
        })
        // Chiama callback se fornito (es. per ricaricare la farmacia)
        if (onSuccess && typeof onSuccess === 'function') {
          onSuccess(data)
        }
      } else {
        toast({ 
          variant: 'destructive', 
          title: '❌ Errore', 
          description: data.error?.join(', ') || 'Arricchimento fallito' 
        })
      }
    } catch (error) {
      console.error('Errore chiamata API:', error)
      setResult({
        success: false,
        error: [`Errore di connessione: ${error.message}. Assicurati che il server API sia in esecuzione (python3 codebase/api_server.py)`]
      })
      toast({ 
        variant: 'destructive', 
        title: 'Errore di connessione', 
        description: `Impossibile connettersi al server API. Verifica che sia in esecuzione su ${API_BASE_URL}` 
      })
    } finally {
      setIsRunning(false)
    }
  }
  
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full h-auto flex-col items-start p-4" disabled={disabled}>
          <div className="flex items-center gap-2 mb-1">
            {icon}
            <span className="font-semibold">{title}</span>
          </div>
          <span className="text-xs text-muted-foreground text-left">{description}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {!showResult && (
            <>
              <div>
                <h4 className="font-semibold mb-2">Comando da eseguire</h4>
                <div className="bg-muted p-3 rounded-lg font-mono text-xs relative">
                  <code className="block break-all whitespace-pre-wrap">
                    {command}
                  </code>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="absolute top-2 right-2"
                    onClick={async () => {
                      await navigator.clipboard?.writeText(command)
                      toast({ title: 'Comando copiato negli appunti' })
                    }}
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
              </div>
              {endpoint && (
                <div className={`border rounded-lg p-3 ${apiAvailable === false ? 'bg-yellow-50 border-yellow-200' : 'bg-blue-50 border-blue-200'}`}>
                  {apiAvailable === false && (
                    <div className="mb-2">
                      <p className="text-sm text-yellow-900 mb-1">
                        <strong>⚠️ Server API non disponibile</strong>
                      </p>
                      <p className="text-xs text-yellow-800 mb-2">
                        Avvia il server con: <code className="bg-yellow-100 px-1 rounded">python3 codebase/api_server.py</code>
                      </p>
                    </div>
                  )}
                  {apiAvailable === true && (
                    <p className="text-sm text-blue-900 mb-2">
                      <strong>⚡ Server API attivo - Esegui direttamente dall'app:</strong>
                    </p>
                  )}
                  <Button 
                    onClick={handleRun} 
                    disabled={isRunning || disabled || apiAvailable === false}
                    className="w-full"
                  >
                    {isRunning ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Esecuzione in corso...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 mr-2" />
                        Avvia Arricchimento
                      </>
                    )}
                  </Button>
                </div>
              )}
            </>
          )}
          
          {showResult && result && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold">Risultato</h4>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      setShowResult(false)
                      setResult(null)
                    }}
                  >
                    Chiudi Risultato
                  </Button>
                  {endpoint && (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={handleRun}
                      disabled={isRunning}
                    >
                      <RefreshCcw className="w-3 h-3 mr-1" />
                      Riesegui
                    </Button>
                  )}
                </div>
              </div>
              
              <div className={`border rounded-lg p-3 ${result.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                <div className="flex items-center gap-2 mb-2">
                  {result.success ? (
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                  )}
                  <span className={`font-semibold ${result.success ? 'text-green-900' : 'text-red-900'}`}>
                    {result.success ? 'Successo' : 'Errore'}
                  </span>
                  {result.returncode !== undefined && (
                    <span className="text-xs text-muted-foreground">
                      (exit code: {result.returncode})
                    </span>
                  )}
                </div>
                
                {result.output && result.output.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-semibold mb-1">Output:</p>
                    <div className="bg-black text-green-400 p-2 rounded font-mono text-xs max-h-48 overflow-y-auto">
                      {result.output.map((line, idx) => (
                        <div key={idx}>{line}</div>
                      ))}
                      {result.full_output_lines > result.output.length && (
                        <div className="text-yellow-400 italic">
                          ... (altre {result.full_output_lines - result.output.length} righe)
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
                {result.error && result.error.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-semibold mb-1">Errori:</p>
                    <div className="bg-black text-red-400 p-2 rounded font-mono text-xs max-h-48 overflow-y-auto">
                      {result.error.map((line, idx) => (
                        <div key={idx}>{line}</div>
                      ))}
                      {result.full_error_lines > result.error.length && (
                        <div className="text-yellow-400 italic">
                          ... (altri {result.full_error_lines - result.error.length} errori)
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
                {result.command && (
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-xs font-semibold mb-1">Comando eseguito:</p>
                    <code className="text-xs bg-muted p-1 rounded block break-all">
                      {result.command}
                    </code>
                  </div>
                )}
              </div>
            </div>
          )}
          
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <p className="text-sm text-yellow-900">
              <strong>Nota:</strong> {endpoint 
                ? 'Puoi eseguire l\'arricchimento direttamente dall\'app (se il server API è attivo) oppure copiare il comando ed eseguirlo nel terminale.'
                : 'Esegui questo comando nel terminale dalla root del progetto per lanciare l\'arricchimento.'
              }
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default function AdminTestPage() {
  const { toast } = useToast()
  const [activeNav, setActiveNav] = useState('stats')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [servicesTax, setServicesTax] = useState([])
  const [stats, setStats] = useState({
    total: 0,
    withGmb: 0,
    withReviews: 0,
    withDeepSeek: 0,
    withWebsite: 0,
    withWebsiteSpidered: 0,
    withCoordinates: 0,
    withServices: 0,
    withRating: 0,
    withHours: 0,
    withoutHours: 0,
    marketplace: null,
    marketplaceError: null,
    loading: true,
  })
  const [turniHealth, setTurniHealth] = useState({
    loading: false,
    generatedAt: null,
    rows: [],
    error: null,
  })

  const loadServicesTax = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('pharmacy_services_taxonomy')
        .select('*')
        .order('category', { ascending: true })
        .order('name', { ascending: true })
      if (error) {
        toast({ variant: 'destructive', title: 'Errore caricamento tassonomia', description: error.message })
        console.error('Errore caricamento tassonomia:', error)
      } else {
        setServicesTax(data || [])
        console.log(`✅ Tassonomia ricaricata: ${data?.length || 0} servizi`)
      }
    } catch (err) {
      console.error('Errore durante caricamento tassonomia:', err)
      toast({ variant: 'destructive', title: 'Errore caricamento tassonomia', description: err.message })
    }
  }, [toast])

  useEffect(() => {
    loadServicesTax()
  }, [loadServicesTax])

  // Carica statistiche farmacie
  const loadStats = useCallback(async () => {
    try {
      setStats(prev => ({ ...prev, loading: true }))
      const adminClient = getAdminSupabaseClient()

      // Totale farmacie
      const { count: total, error: totalError } = await adminClient
        .from('paginegialle_pharmacies')
        .select('*', { count: 'exact', head: true })

      if (totalError) throw totalError

      // Farmacie con GMB (gmb_status non null e non 'pending')
      const { count: withGmb, error: gmbError } = await adminClient
        .from('paginegialle_pharmacies')
        .select('*', { count: 'exact', head: true })
        .not('gmb_status', 'is', null)
        .neq('gmb_status', 'pending')

      if (gmbError) throw gmbError

      // Farmacie con recensioni (hanno almeno una recensione in google_reviews_pg)
      // Query: seleziona solo pharmacy_id distinti
      const { data: reviewsData, error: reviewsError } = await adminClient
        .from('google_reviews_pg')
        .select('pharmacy_id')
      
      let withReviews = 0
      if (!reviewsError && reviewsData) {
        // Conta pharmacy_id unici
        const uniquePharmacyIds = new Set(reviewsData.map(r => r.pharmacy_id))
        withReviews = uniquePharmacyIds.size
      }

      // Farmacie con DeepSeek (deepupdate_status = 'completed')
      const { count: withDeepSeek, error: deepseekError } = await adminClient
        .from('paginegialle_pharmacies')
        .select('*', { count: 'exact', head: true })
        .eq('deepupdate_status', 'completed')

      if (deepseekError) throw deepseekError

      // Farmacie con sito web (website non null)
      const { count: withWebsite, error: websiteError } = await adminClient
        .from('paginegialle_pharmacies')
        .select('*', { count: 'exact', head: true })
        .not('website', 'is', null)

      if (websiteError) throw websiteError

      // Farmacie con sito spiderato (website_spidered_at non null)
      const { count: withWebsiteSpidered, error: websiteSpideredError } = await adminClient
        .from('paginegialle_pharmacies')
        .select('*', { count: 'exact', head: true })
        .not('website_spidered_at', 'is', null)

      if (websiteSpideredError) throw websiteSpideredError

      // Farmacie con coordinate
      const { count: withCoordinates, error: coordsError } = await adminClient
        .from('paginegialle_pharmacies')
        .select('*', { count: 'exact', head: true })
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)

      if (coordsError) throw coordsError

      // Farmacie con servizi (services non vuoto o array non vuoto)
      const { data: pharmaciesWithServices, error: servicesError } = await adminClient
        .from('paginegialle_pharmacies')
        .select('services')
        .limit(1000)
      
      let withServices = 0
      if (!servicesError && pharmaciesWithServices) {
        withServices = pharmaciesWithServices.filter(p => {
          const services = p.services
          return services && (
            (Array.isArray(services) && services.length > 0) ||
            (typeof services === 'object' && Object.keys(services).length > 0) ||
            (typeof services === 'string' && services.trim().length > 0)
          )
        }).length
        
        // Se abbiamo meno di 1000 farmacie, questo è il conteggio esatto
        // Altrimenti stimiamo
        if (total && total > 1000) {
          const ratio = withServices / (pharmaciesWithServices.length || 1)
          withServices = Math.round(ratio * total)
        }
      }

      // Farmacie con rating cached
      const { count: withRating, error: ratingError } = await adminClient
        .from('paginegialle_pharmacies')
        .select('*', { count: 'exact', head: true })
        .not('rating_avg_cached', 'is', null)

      if (ratingError) throw ratingError

      // Farmacie con orari (opening_hours non null e non vuoto)
      // Carichiamo un campione per verificare la struttura di opening_hours
      const { data: pharmaciesSample, error: hoursSampleError } = await adminClient
        .from('paginegialle_pharmacies')
        .select('opening_hours')
        .limit(1000)

      let withHours = 0
      let withoutHours = 0
      
      if (!hoursSampleError && pharmaciesSample) {
        pharmaciesSample.forEach(pharmacy => {
          const hours = pharmacy.opening_hours
          if (hours && typeof hours === 'object' && Object.keys(hours).length > 0) {
            withHours++
          } else {
            withoutHours++
          }
        })
        
        // Se abbiamo un campione completo (<= 1000 farmacie), usa il conteggio esatto
        // Altrimenti stima basata sul campione
        if (total && total <= 1000) {
          // Conta esatto: carica tutte le farmacie
          const { data: allPharmacies, error: allPharmaciesError } = await adminClient
            .from('paginegialle_pharmacies')
            .select('opening_hours')
          
          if (!allPharmaciesError && allPharmacies) {
            withHours = allPharmacies.filter(pharmacy => {
              const hours = pharmacy.opening_hours
              return hours && typeof hours === 'object' && Object.keys(hours).length > 0
            }).length
            withoutHours = total - withHours
          }
        } else {
          // Stima basata sul campione
          const ratio = withHours / (pharmaciesSample.length || 1)
          withHours = Math.round(ratio * total)
          withoutHours = total - withHours
        }
      }

      let marketplace = null
      let marketplaceError = null
      try {
        const response = await fetch('/api/marketplace/admin?resource=stats', { credentials: 'same-origin' })
        const payload = await response.json().catch(() => ({}))
        if (response.ok && payload.success) {
          marketplace = payload.stats || null
        } else {
          marketplaceError = payload.error || `HTTP ${response.status}`
        }
      } catch (marketErr) {
        marketplaceError = marketErr.message || 'Marketplace stats non disponibili'
      }

      setStats({
        total: total || 0,
        withGmb: withGmb || 0,
        withReviews: withReviews || 0,
        withDeepSeek: withDeepSeek || 0,
        withWebsite: withWebsite || 0,
        withWebsiteSpidered: withWebsiteSpidered || 0,
        withCoordinates: withCoordinates || 0,
        withServices: withServices || 0,
        withRating: withRating || 0,
        withHours: withHours || 0,
        withoutHours: withoutHours || 0,
        marketplace,
        marketplaceError,
        loading: false,
      })
    } catch (err) {
      console.error('Errore caricamento statistiche:', err)
      toast({ variant: 'destructive', title: 'Errore statistiche', description: err.message })
      setStats(prev => ({ ...prev, loading: false }))
    }
  }, [toast])

  const loadTurniHealth = useCallback(async () => {
    try {
      setTurniHealth({
        loading: true,
        generatedAt: null,
        rows: [],
        error: null,
      })
      const adminClient = getAdminSupabaseClient()
      const now = new Date()
      const nowIso = now.toISOString()
      const todayIso = nowIso.slice(0, 10)

      const { data: sources, error: sourcesError } = await adminClient
        .from('turni_sources')
        .select('id, slug, name, province, region, is_active')
        .eq('is_active', true)
        .order('slug', { ascending: true })

      if (sourcesError) throw sourcesError

      const relevantSources = (sources || []).filter((source) => {
        const slug = String(source.slug || '')
        return (
          slug.startsWith('pharmaround-turni-') ||
          slug === 'federfarma-lombardia' ||
          slug === 'ordine-farmacisti-venezia' ||
          slug === 'ordine-farmacisti-caltanissetta' ||
          slug === 'ordine-farmacisti-roma' ||
          slug === 'aulss9-verona' ||
          slug === 'ordine-farmacisti-messina'
        )
      })

      const rows = []
      for (const source of relevantSources) {
        const expectedCadenceHours = getExpectedCadenceHours(source.slug)

        const [{ count: pharmaciesCount, error: pharmaciesError }, { data: lastPharmacyRow, error: lastPharmacyError }, { data: lastShiftRow, error: lastShiftError }, { count: todayShiftCount, error: todayShiftError }, { count: activeNowCount, error: activeNowError }] = await Promise.all([
          adminClient
            .from('paginegialle_pharmacies')
            .select('id', { count: 'exact', head: true })
            .eq('turni_source_id', source.id),
          adminClient
            .from('paginegialle_pharmacies')
            .select('turni_updated_at')
            .eq('turni_source_id', source.id)
            .not('turni_updated_at', 'is', null)
            .order('turni_updated_at', { ascending: false })
            .limit(1),
          adminClient
            .from('pharmacy_daily_shifts')
            .select('shift_date, updated_at')
            .eq('turni_source_id', source.id)
            .order('shift_date', { ascending: false })
            .order('updated_at', { ascending: false })
            .limit(1),
          adminClient
            .from('pharmacy_daily_shifts')
            .select('pharmacy_id', { count: 'exact', head: true })
            .eq('turni_source_id', source.id)
            .eq('shift_date', todayIso),
          adminClient
            .from('pharmacy_daily_shifts')
            .select('pharmacy_id', { count: 'exact', head: true })
            .eq('turni_source_id', source.id)
            .lte('start_at', nowIso)
            .gte('end_at', nowIso),
        ])

        if (pharmaciesError || lastPharmacyError || lastShiftError || todayShiftError || activeNowError) {
          rows.push({
            slug: source.slug,
            name: source.name,
            province: source.province,
            region: source.region,
            expectedCadenceHours,
            status: 'error',
            pharmaciesCount: pharmaciesCount || 0,
            todayShiftCount: todayShiftCount || 0,
            activeNowCount: activeNowCount || 0,
            lastShiftDate: null,
            lastUpdateIso: null,
            ageHours: null,
          })
          continue
        }

        const lastPharmacyIso = lastPharmacyRow?.[0]?.turni_updated_at || null
        const lastShiftDate = lastShiftRow?.[0]?.shift_date || null
        const lastShiftUpdateIso = lastShiftRow?.[0]?.updated_at || null
        const updateRefIso = lastShiftUpdateIso || lastPharmacyIso || null
        const ageHours = updateRefIso ? (now.getTime() - new Date(updateRefIso).getTime()) / 3600000 : null

        let status = 'ok'
        if (ageHours == null) {
          status = 'warning'
        } else if (ageHours > expectedCadenceHours * 2) {
          status = 'warning'
        }
        if (!todayShiftCount && !String(source.slug || '').startsWith('pharmaround-turni-') && String(source.slug || '') !== 'ordine-farmacisti-venezia' && String(source.slug || '') !== 'aulss9-verona') {
          status = 'warning'
        }

        rows.push({
          slug: source.slug,
          name: source.name,
          province: source.province,
          region: source.region,
          expectedCadenceHours,
          status,
          pharmaciesCount: pharmaciesCount || 0,
          todayShiftCount: todayShiftCount || 0,
          activeNowCount: activeNowCount || 0,
          lastShiftDate,
          lastUpdateIso: updateRefIso,
          ageHours,
        })
      }

      rows.sort((a, b) => {
        const ap = a.status === 'warning' ? 0 : a.status === 'error' ? -1 : 1
        const bp = b.status === 'warning' ? 0 : b.status === 'error' ? -1 : 1
        if (ap !== bp) return ap - bp
        return String(a.slug).localeCompare(String(b.slug))
      })

      setTurniHealth({
        loading: false,
        generatedAt: new Date().toISOString(),
        rows,
        error: null,
      })
    } catch (err) {
      console.error('Errore caricamento health turni:', err)
      setTurniHealth({
        loading: false,
        generatedAt: null,
        rows: [],
        error: err.message || 'Errore sconosciuto',
      })
      toast({ variant: 'destructive', title: 'Errore health turni', description: err.message })
    }
  }, [toast])

  useEffect(() => {
    if (activeNav === 'stats') {
      loadStats()
    }
    if (activeNav === 'turni-updates') {
      loadTurniHealth()
    }
  }, [activeNav, loadStats, loadTurniHealth])

  return (
    <div className="min-h-screen bg-[var(--ac-bg)] text-[var(--ac-text)]">
      <header className="border-b border-[var(--ac-border)] bg-[var(--ac-panel)]">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-3">
          <button type="button" className="lg:hidden text-[var(--ac-text)]" onClick={() => setSidebarOpen(prev => !prev)} aria-label="Apri menu">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <p className="text-xs uppercase text-[var(--ac-muted)]">Console amministrativa (Modalità Test)</p>
            <h1 className="text-xl font-semibold text-[var(--ac-text)]">ProntoFarmacie</h1>
          </div>
          <div className="flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-[var(--ac-warn-bg)] text-[var(--ac-warn-fg)]">
            <AlertTriangle className="w-4 h-4" />
            <span>Test senza autenticazione</span>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto flex">
        <aside
          className={`border-r border-[var(--ac-border)] bg-[var(--ac-panel)] w-64 p-4 space-y-2 ${sidebarOpen ? 'block' : 'hidden'} lg:block`}
        >
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveNav(item.id)}
              className={`w-full flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition ${
                activeNav === item.id
                  ? 'border-transparent bg-[var(--ac-active-bg)] text-[var(--ac-active-fg)]'
                  : 'border-[var(--ac-border)] bg-transparent text-[var(--ac-text)] hover:bg-[var(--ac-hover)]'
              }`}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              <div>
                <p className="text-sm font-semibold">{item.label}</p>
                <p className={`text-xs ${activeNav === item.id ? 'text-[var(--ac-active-muted)]' : 'text-[var(--ac-muted)]'}`}>
                  {item.description}
                </p>
              </div>
            </button>
          ))}
        </aside>

        <main className="flex-1 p-6 space-y-6 text-[var(--ac-text)]">
          {activeNav === 'stats' && <StatsSection stats={stats} onRefresh={loadStats} onGoUsers={() => setActiveNav('users')} onGoClaims={() => setActiveNav('claims')} />}
          {activeNav === 'users' && (
            <section className="space-y-4">
              <div>
                <h2 className="text-2xl font-semibold">Utenti registrati</h2>
                <p className="text-sm text-[var(--ac-muted)]">
                  Account Area farmacia e Area candidati: disabilita/riattiva e monitora claim, alert e annunci.
                </p>
              </div>
              <AdminJobApprovals embedded lockedTab="users" />
            </section>
          )}
          {activeNav === 'claims' && (
            <section className="space-y-4">
              <div>
                <h2 className="text-2xl font-semibold">Claim farmacie</h2>
                <p className="text-sm text-[var(--ac-muted)]">
                  Approvazione/rifiuto delle richieste di collegamento scheda. Una farmacia può avere un solo claim approvato.
                </p>
              </div>
              <Card className="border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                <div className="flex gap-2">
                  <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
                  <p>
                    Approva solo dopo verifica ownership (email scheda, documento, contatto telefonico).
                    Il rifiuto lascia la scheda libera per un nuovo claim.
                  </p>
                </div>
              </Card>
              <AdminJobApprovals embedded lockedTab="claims" />
            </section>
          )}
          {activeNav === 'jobs' && (
            <section className="space-y-4">
              <div>
                <h2 className="text-2xl font-semibold">Offerte di lavoro</h2>
                <p className="text-sm text-[var(--ac-muted)]">
                  Moderazione annunci inseriti dalle farmacie: pubblica o rifiuta con nota.
                </p>
              </div>
              <AdminJobApprovals embedded lockedTab="submissions" />
            </section>
          )}
          {activeNav === 'turni-updates' && (
            <TurniUpdatesSection turniHealth={turniHealth} onRefresh={loadTurniHealth} />
          )}
          {activeNav === 'pharmacies' && (
            <PharmaciesSection toast={toast} servicesTax={servicesTax} reloadTaxonomy={loadServicesTax} />
          )}
          {activeNav === 'taxonomy' && (
            <TaxonomySection toast={toast} taxonomy={servicesTax} reloadTaxonomy={loadServicesTax} />
          )}
        </main>
      </div>
    </div>
  )
}

const StatsSection = ({ stats, onRefresh, onGoUsers, onGoClaims }) => {
  const percentage = (value, total) => total > 0 ? ((value / total) * 100).toFixed(1) : '0.0'
  const m = stats.marketplace || {}

  const marketplaceCards = [
    {
      title: 'Utenti registrati',
      value: m.registeredUsers || 0,
      icon: Users,
      color: 'bg-indigo-500',
      textColor: 'text-indigo-500',
      description: 'Account locali marketplace',
      onClick: onGoUsers,
    },
    {
      title: 'Farmacisti',
      value: m.pharmacyOwners || 0,
      icon: Stethoscope,
      color: 'bg-emerald-500',
      textColor: 'text-emerald-500',
      description: 'Ruolo pharmacy_owner',
      onClick: onGoUsers,
    },
    {
      title: 'Candidati',
      value: m.jobSeekers || 0,
      icon: Users,
      color: 'bg-sky-500',
      textColor: 'text-sky-500',
      description: 'Ruolo job_seeker',
      onClick: onGoUsers,
    },
    {
      title: 'Claim in verifica',
      value: m.claimsPending || 0,
      icon: ShieldCheck,
      color: 'bg-amber-500',
      textColor: 'text-amber-500',
      description: 'Da approvare o rifiutare',
      onClick: onGoClaims,
    },
    {
      title: 'Claim approvati',
      value: m.claimsApproved || 0,
      icon: CheckCircle2,
      color: 'bg-emerald-600',
      textColor: 'text-emerald-600',
      description: 'Schede collegate',
      onClick: onGoClaims,
    },
    {
      title: 'Annunci in coda',
      value: m.submissionsPending || 0,
      icon: Inbox,
      color: 'bg-violet-500',
      textColor: 'text-violet-500',
      description: 'Offerte da moderare',
    },
    {
      title: 'Alert attivi',
      value: m.activeAlerts || 0,
      icon: Sparkles,
      color: 'bg-pink-500',
      textColor: 'text-pink-500',
      description: 'Radar lavoro candidati',
    },
  ]

  const statCards = [
    {
      title: 'Totale Farmacie',
      value: stats.total,
      icon: Stethoscope,
      color: 'bg-blue-500',
      textColor: 'text-blue-500',
      description: 'Farmacie totali nel database',
    },
    {
      title: 'Con GMB',
      value: stats.withGmb,
      percentage: percentage(stats.withGmb, stats.total),
      icon: CheckCircle2,
      color: 'bg-green-500',
      textColor: 'text-green-500',
      description: 'Arricchite con Google My Business',
    },
    {
      title: 'Con Recensioni',
      value: stats.withReviews,
      percentage: percentage(stats.withReviews, stats.total),
      icon: MessageSquare,
      color: 'bg-purple-500',
      textColor: 'text-purple-500',
      description: 'Hanno almeno una recensione',
    },
    {
      title: 'Con DeepSeek',
      value: stats.withDeepSeek,
      percentage: percentage(stats.withDeepSeek, stats.total),
      icon: Brain,
      color: 'bg-indigo-500',
      textColor: 'text-indigo-500',
      description: 'Analisi sentiment completata',
    },
    {
      title: 'Con Sito',
      value: stats.withWebsite,
      percentage: percentage(stats.withWebsite, stats.total),
      icon: Globe,
      color: 'bg-cyan-500',
      textColor: 'text-cyan-500',
      description: 'Hanno un sito web',
    },
    {
      title: 'Con Sito Spiderato',
      value: stats.withWebsiteSpidered,
      percentage: percentage(stats.withWebsiteSpidered, stats.total),
      icon: Globe,
      color: 'bg-orange-500',
      textColor: 'text-orange-500',
      description: 'Sito web analizzato',
    },
    {
      title: 'Con Coordinate',
      value: stats.withCoordinates,
      percentage: percentage(stats.withCoordinates, stats.total),
      icon: Stethoscope,
      color: 'bg-teal-500',
      textColor: 'text-teal-500',
      description: 'Hanno lat/lng',
    },
    {
      title: 'Con Servizi',
      value: stats.withServices,
      percentage: percentage(stats.withServices, stats.total),
      icon: ListTree,
      color: 'bg-pink-500',
      textColor: 'text-pink-500',
      description: 'Hanno servizi associati',
    },
    {
      title: 'Con Rating',
      value: stats.withRating,
      percentage: percentage(stats.withRating, stats.total),
      icon: CheckCircle2,
      color: 'bg-yellow-500',
      textColor: 'text-yellow-500',
      description: 'Hanno rating cached',
    },
    {
      title: 'Con Orari',
      value: stats.withHours,
      percentage: percentage(stats.withHours, stats.total),
      icon: Calendar,
      color: 'bg-emerald-500',
      textColor: 'text-emerald-500',
      description: 'Hanno orari configurati',
    },
    {
      title: 'Senza Orari',
      value: stats.withoutHours,
      percentage: percentage(stats.withoutHours, stats.total),
      icon: CalendarX,
      color: 'bg-red-500',
      textColor: 'text-red-500',
      description: 'Non hanno orari configurati',
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[var(--ac-text)]">Statistiche Database</h2>
          <p className="text-[var(--ac-muted)]">Registrazioni, claim, offerte e completezza arricchimenti farmacie.</p>
        </div>
        <Button onClick={onRefresh} disabled={stats.loading} variant="outline">
          <RefreshCcw className={`w-4 h-4 mr-2 ${stats.loading ? 'animate-spin' : ''}`} />
          Aggiorna
        </Button>
      </div>

      {stats.loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--ac-muted)]" />
        </div>
      ) : (
        <>
          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--ac-muted)]">Marketplace / registrati</h3>
            {stats.marketplaceError && !stats.marketplace ? (
              <Card className="mb-4 border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                Metriche claim/registrati non disponibili ({stats.marketplaceError}). Apri la sezione Utenti e accedi come admin locale, oppure imposta <code>ADMIN_TEST_ALLOW_UNAUTH=true</code>.
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                {marketplaceCards.map((card, index) => (
                  <Card
                    key={`m-${index}`}
                    className={`hover:shadow-lg transition-shadow border-[var(--ac-border)] bg-[var(--ac-card)] ${card.onClick ? 'cursor-pointer' : ''}`}
                    onClick={card.onClick}
                  >
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className={`p-3 rounded-lg ${card.color} bg-opacity-20`}>
                          <card.icon className={`w-6 h-6 ${card.textColor}`} />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <p className="text-3xl font-bold text-[var(--ac-text)]">{Number(card.value || 0).toLocaleString('it-IT')}</p>
                        <p className="text-sm font-medium text-[var(--ac-text)]">{card.title}</p>
                        <p className="text-xs text-[var(--ac-muted)]">{card.description}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--ac-muted)]">Arricchimento farmacie</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {statCards.map((card, index) => (
              <Card key={index} className="hover:shadow-lg transition-shadow border-[var(--ac-border)] bg-[var(--ac-card)]">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className={`p-3 rounded-lg ${card.color} bg-opacity-20`}>
                      <card.icon className={`w-6 h-6 ${card.textColor}`} />
                    </div>
                    {card.percentage && (
                      <span className="text-sm font-semibold text-[var(--ac-muted)]">{card.percentage}%</span>
                    )}
                  </div>
                  <div className="space-y-1">
                    <p className="text-3xl font-bold text-[var(--ac-text)]">{card.value.toLocaleString('it-IT')}</p>
                    <p className="text-sm font-medium text-[var(--ac-text)]">{card.title}</p>
                    <p className="text-xs text-[var(--ac-muted)]">{card.description}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          </div>

          {/* Riepilogo */}
          <Card>
            <CardHeader>
              <CardTitle>Riepilogo Arricchimento</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Completamente arricchite</p>
                  <p className="text-2xl font-bold">
                    {Math.min(stats.withGmb, stats.withDeepSeek, stats.withWebsite, stats.withReviews).toLocaleString('it-IT')}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Parzialmente arricchite</p>
                  <p className="text-2xl font-bold">
                    {(stats.total - Math.min(stats.withGmb, stats.withDeepSeek, stats.withWebsite, stats.withReviews)).toLocaleString('it-IT')}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Da arricchire (GMB)</p>
                  <p className="text-2xl font-bold text-orange-600">
                    {(stats.total - stats.withGmb).toLocaleString('it-IT')}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Da arricchire (Sito)</p>
                  <p className="text-2xl font-bold text-orange-600">
                    {(stats.total - stats.withWebsite).toLocaleString('it-IT')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

const TurniUpdatesSection = ({ turniHealth, onRefresh }) => {
  const rows = Array.isArray(turniHealth?.rows) ? turniHealth.rows : []
  const warningCount = rows.filter((row) => row.status === 'warning').length
  const errorCount = rows.filter((row) => row.status === 'error').length

  const formatDateTime = (value) => {
    if (!value) return '—'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '—'
    return date.toLocaleString('it-IT')
  }

  const formatAge = (hours) => {
    if (hours == null || Number.isNaN(hours)) return '—'
    if (hours < 1) return `${Math.round(hours * 60)}m fa`
    if (hours < 24) return `${hours.toFixed(1)}h fa`
    return `${(hours / 24).toFixed(1)}g fa`
  }

  const getStatusUi = (status) => {
    if (status === 'error') {
      return { label: 'Errore', className: 'bg-red-100 text-red-700 border-red-200' }
    }
    if (status === 'warning') {
      return { label: 'Attenzione', className: 'bg-amber-100 text-amber-700 border-amber-200' }
    }
    return { label: 'OK', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Aggiornamenti Turno</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Ultimo refresh: {formatDateTime(turniHealth?.generatedAt)}
            </p>
          </div>
          <Button onClick={onRefresh} variant="outline" disabled={Boolean(turniHealth?.loading)}>
            {turniHealth?.loading ? (
              <>
                <Loader2 className="mr-2 w-4 h-4 animate-spin" />
                Aggiorno...
              </>
            ) : (
              <>
                <RefreshCcw className="mr-2 w-4 h-4" />
                Aggiorna
              </>
            )}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border bg-white p-3">
              <p className="text-xs uppercase text-muted-foreground">Fonti monitorate</p>
              <p className="text-2xl font-semibold">{rows.length}</p>
            </div>
            <div className="rounded-lg border bg-white p-3">
              <p className="text-xs uppercase text-muted-foreground">Warning</p>
              <p className="text-2xl font-semibold text-amber-700">{warningCount}</p>
            </div>
            <div className="rounded-lg border bg-white p-3">
              <p className="text-xs uppercase text-muted-foreground">Errori</p>
              <p className="text-2xl font-semibold text-red-700">{errorCount}</p>
            </div>
          </div>

          {turniHealth?.error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              Errore caricamento: {turniHealth.error}
            </div>
          )}

          {!turniHealth?.loading && !turniHealth?.error && rows.length === 0 && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              Nessuna fonte turno trovata.
            </div>
          )}

          {!!rows.length && (
            <div className="overflow-x-auto rounded-lg border bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Fonte</th>
                    <th className="px-3 py-2 text-left font-medium">Stato</th>
                    <th className="px-3 py-2 text-left font-medium">Ultimo update</th>
                    <th className="px-3 py-2 text-left font-medium">Ritardo</th>
                    <th className="px-3 py-2 text-left font-medium">Turni oggi</th>
                    <th className="px-3 py-2 text-left font-medium">Aperte ora</th>
                    <th className="px-3 py-2 text-left font-medium">Farmacie</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const statusUi = getStatusUi(row.status)
                    return (
                      <tr key={row.slug} className="border-t align-top">
                        <td className="px-3 py-2">
                          <p className="font-medium text-slate-900">{row.name || row.slug}</p>
                          <p className="text-xs text-muted-foreground">{row.slug}</p>
                          <p className="text-xs text-muted-foreground">{row.province || row.region || '—'}</p>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${statusUi.className}`}>
                            {statusUi.label}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <p>{formatDateTime(row.lastUpdateIso)}</p>
                          <p className="text-xs text-muted-foreground">shift max: {row.lastShiftDate || '—'}</p>
                        </td>
                        <td className="px-3 py-2">
                          <p>{formatAge(row.ageHours)}</p>
                          <p className="text-xs text-muted-foreground">atteso ogni {row.expectedCadenceHours}h</p>
                        </td>
                        <td className="px-3 py-2">{Number(row.todayShiftCount || 0).toLocaleString('it-IT')}</td>
                        <td className="px-3 py-2">{Number(row.activeNowCount || 0).toLocaleString('it-IT')}</td>
                        <td className="px-3 py-2">{Number(row.pharmaciesCount || 0).toLocaleString('it-IT')}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

const UsersSection = ({ toast }) => {
  const [rows, setRows] = useState([])
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(false)

  const loadUsers = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('profiles').select('*').order('updated_at', { ascending: false })
    setLoading(false)
    if (error) {
      toast({ variant: 'destructive', title: 'Errore caricando utenti', description: error.message })
    } else {
      setRows(data || [])
    }
  }, [toast])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  const filtered = useMemo(() => {
    if (!filter) return rows
    const needle = filter.toLowerCase()
    return rows.filter(row => {
      return (
        row.full_name?.toLowerCase().includes(needle) ||
        row.role?.toLowerCase().includes(needle) ||
        row.id?.toLowerCase().includes(needle)
      )
    })
  }, [rows, filter])

  const updateRole = async (row, role) => {
    const { error } = await supabase
      .from('profiles')
      .update({ role, updated_at: new Date().toISOString() })
      .eq('id', row.id)
    if (error) {
      toast({ variant: 'destructive', title: 'Errore aggiornando ruolo', description: error.message })
    } else {
      toast({ title: `Ruolo aggiornato per ${row.full_name || row.id}` })
      setRows(prev => prev.map(item => (item.id === row.id ? { ...item, role } : item)))
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Utenti</h2>
          <p className="text-sm text-muted-foreground">
            Gestisci i ruoli applicativi. Il ruolo "admin" abilita l'accesso a questa sezione.
          </p>
        </div>
        <div className="ml-auto flex gap-2">
          <Input
            placeholder="Cerca per nome, ruolo o ID"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="w-64"
          />
          <Button variant="outline" onClick={loadUsers} disabled={loading}>
            <RefreshCcw className="w-4 h-4 mr-2" /> Aggiorna
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="text-left px-4 py-2">Nome</th>
              <th className="text-left px-4 py-2">ID</th>
              <th className="text-left px-4 py-2">Ruolo</th>
              <th className="text-left px-4 py-2">Aggiornato</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(row => (
              <tr key={row.id} className="border-t">
                <td className="px-4 py-3 font-medium">{row.full_name || '—'}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{row.id}</td>
                <td className="px-4 py-3">
                  <Select value={row.role || 'user'} onValueChange={val => updateRole(row, val)}>
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {row.updated_at ? new Date(row.updated_at).toLocaleString() : '—'}
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={4} className="text-center py-6 text-muted-foreground">
                  Nessun utente trovato
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

const ClinicsSection = ({ toast, servicesTax }) => {
  const [slug, setSlug] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [view, setView] = useState('clinic')
  const [loading, setLoading] = useState(false)
  const [pharmacy, setPharmacy] = useState(null)
  const [services, setServices] = useState([])
  const [reviews, setReviews] = useState([])
  const [images, setImages] = useState([])
  
  // API base URL per chiamate di arricchimento
  const API_BASE_URL = import.meta.env.VITE_API_SERVER_URL || 'http://localhost:5001'

  const searchClinics = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      return
    }
    setSearching(true)
    const query = searchQuery.trim().toLowerCase()
    const { data, error } = await supabase
      .from('clinics')
      .select('id, name, slug, address, city')
      .or(`name.ilike.%${query}%,slug.ilike.%${query}%,address.ilike.%${query}%,city.ilike.%${query}%`)
      .limit(20)
    
    setSearching(false)
    if (error) {
      toast({ variant: 'destructive', title: 'Errore ricerca', description: error.message })
    } else {
      setSearchResults(data || [])
    }
  }

  const loadClinic = async () => {
    if (!slug) return
    setLoading(true)
    try {
      // Usa client admin per bypassare RLS se necessario
      const adminClient = getAdminSupabaseClient()
      const { data, error } = await adminClient.rpc('get_clinic_page', { p_slug: slug })
      
      if (error) {
        console.error('Errore RPC get_clinic_page:', error)
        toast({ variant: 'destructive', title: 'Errore caricando clinica', description: error.message || JSON.stringify(error) })
        setLoading(false)
        return
      }
      
      if (!data || !data.clinic) {
        toast({ variant: 'destructive', title: 'Clinica non trovata', description: `Nessuna clinica trovata con slug: ${slug}` })
        setLoading(false)
        return
      }
      
      setPharmacy(data.pharmacy || null)
      setServices(
        (data?.services || []).map(item => ({
          service_id: item.service_id,
          price: item.price,
          animal_type: item.animal_type,
          service_name: item.service_name,
          service_category: item.service_category,
        }))
      )
      setReviews((data?.latest3 || []).map(r => ({
        review_id: r.review_id,
        rating: r.star_rating,
        text: r.comment,
        author_name: r.reviewer_name,
        profile_photo_url: r.reviewer_photo,
        time: r.created_at_g,
        source: r.source || 'google',
      })))
      setImages(data?.pharmacy?.images || data?.pharmacy?.gallery_images || [])
      setLoading(false)
      toast({ title: 'Clinica caricata' })
    } catch (err) {
      console.error('Errore caricamento clinica:', err)
      toast({ variant: 'destructive', title: 'Errore caricando clinica', description: err.message || 'Errore sconosciuto' })
      setLoading(false)
    }
  }

  const saveClinic = async () => {
    if (!clinic) return
    if (!pharmacy.name || !(pharmacy.address || pharmacy.street)) {
      toast({ variant: 'destructive', title: 'Inserisci nome e indirizzo' })
      return
    }

    const payload = {
      name: pharmacy.name,
      slug: pharmacy.slug,
      address: {
        street: pharmacy.street ?? pharmacy.address?.split(',')[0]?.trim() ?? '',
        city: pharmacy.city ?? null,
        province: pharmacy.province ?? null,
        region: pharmacy.region ?? null,
        cap: pharmacy.cap ?? null,
        country: pharmacy.country ?? 'IT',
      },
      geo: { lat: pharmacy.lat ?? null, lng: pharmacy.lng ?? null },
      contacts: { phone: pharmacy.phone ?? null, email: pharmacy.email ?? null },
      hours: pharmacy.hours ?? null,
      website: pharmacy.website ? (pharmacy.website.startsWith('http') ? pharmacy.website : `https://${pharmacy.website}`) : null,
      gmb: { place_id: clinic.place_id ?? null, maps_url: clinic.maps_url ?? null },
      rating: { avg: clinic.rating_avg_cached ?? null, count: clinic.rating_count_cached ?? null },
      services: services.map(s => ({ service_id: s.service_id, price: s.price, animal_type: s.animal_type })),
    }

    setLoading(true)
    const { error } = await supabase.rpc('upsert_clinic_listing', {
      p_payload: payload,
      p_options: { upsert_services: true },
    })
    
    if (error) {
      setLoading(false)
      toast({ variant: 'destructive', title: 'Errore salvataggio', description: error.message })
      return
    }
    
    // Aggiorna source_url e hours se modificati (usando admin client per bypassare RLS)
    if (clinic?.id) {
      const adminClient = getAdminSupabaseClient()
      const updateData = {}
      if (clinic?.source_url !== undefined) {
        updateData.source_url = clinic.source_url || null
      }
      if (clinic?.hours !== undefined) {
        updateData.hours = clinic.hours || null
      }
      if (Object.keys(updateData).length > 0) {
        const { error: updateError } = await adminClient
          .from('paginegialle_pharmacies')
          .update({
            ...updateData,
            // Se la source_url è stata modificata, resetta lo status per permettere nuova verifica
            ...(clinic?.source_url !== undefined ? {
              source_url_status: clinic.source_url ? null : null,
              source_url_verified_at: null,
            } : {})
          })
          .eq('id', clinic.id)
      
        if (updateError) {
          console.warn('Errore aggiornando campi aggiuntivi:', updateError)
          // Non blocchiamo il salvataggio se solo l'aggiornamento fallisce
        } else {
          if (clinic?.source_url) {
            console.log('✅ Source URL aggiornata, status resettato per nuova verifica')
          }
          if (clinic?.hours) {
            console.log('✅ Orari aggiornati')
          }
        }
      }
    }
    
    setLoading(false)
    toast({ title: 'Clinica salvata con successo' })
    await loadClinic()
  }

  const importGoogleReviews = async () => {
    if (!clinic?.id) {
      toast({ variant: 'destructive', title: 'Carica prima una clinica' })
      return
    }
    const payload = reviews
      .filter(r => Number(r.rating) >= 1 && Number(r.rating) <= 5)
      .map(r => ({
        review_id: r.review_id || undefined,
        rating: Number(r.rating),
        text: r.text || '',
        author_name: r.author_name || 'Anonimo',
        profile_photo_url: r.profile_photo_url || null,
        time: r.time || new Date().toISOString(),
        source: r.source || 'google',
      }))

    setLoading(true)
    const { data, error } = await supabase.rpc('upsert_google_reviews', {
      p_clinic_id: clinic.id,
      p_reviews: payload,
      p_options: { recompute_summary: true },
    })
    setLoading(false)
    if (error) {
      toast({ variant: 'destructive', title: 'Errore import recensioni', description: error.message })
      return
    }
    const ins = data?.[0]?.inserted_count || 0
    const upd = data?.[0]?.updated_count || 0
    toast({ title: `Recensioni importate (${ins} nuove, ${upd} aggiornate)` })
    await loadClinic()
  }

  const addImage = async file => {
    if (!file || !clinic?.id) {
      toast({ variant: 'destructive', title: 'Carica prima la clinica' })
      return
    }

    const form = new FormData()
    form.append('pharmacy_id', clinic.id)
    form.append('image', file)

    setLoading(true)
    try {
      const response = await fetch('/api/admin-gallery', {
        method: 'POST',
        body: form,
        credentials: 'same-origin',
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || payload.success === false) {
        throw new Error(payload.error || `Upload fallito (${response.status})`)
      }

      setImages(payload.images || [])
      toast({ title: 'Immagine caricata' })
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Upload fallito',
        description: error.message || 'Errore sconosciuto',
      })
    } finally {
      setLoading(false)
    }
  }

  const renderClinicView = () => (
    <Card>
      <CardHeader>
        <CardTitle>Dati clinica</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Nome">
            <Input value={clinic?.name || ''} onChange={e => setClinic({ ...clinic, name: e.target.value })} />
          </Field>
          <Field label="Slug">
            <Input value={clinic?.slug || ''} onChange={e => setClinic({ ...clinic, slug: e.target.value })} />
          </Field>
          <Field label="Telefono">
            <Input value={clinic?.phone || ''} onChange={e => setClinic({ ...clinic, phone: e.target.value })} />
          </Field>
          <Field label="Email">
            <Input value={clinic?.email || ''} onChange={e => setClinic({ ...clinic, email: e.target.value })} />
          </Field>
          <Field label="Indirizzo completo" className="md:col-span-2">
            <Textarea value={clinic?.address || ''} onChange={e => setClinic({ ...clinic, address: e.target.value })} />
          </Field>
          <Field label="Website">
            <Input value={clinic?.website || ''} onChange={e => setClinic({ ...clinic, website: e.target.value })} />
          </Field>
          <Field label="Place ID">
            <Input value={clinic?.place_id || ''} onChange={e => setClinic({ ...clinic, place_id: e.target.value })} />
          </Field>
          <Field label="Source URL (PagineGialle)" className="md:col-span-2">
            <Input 
              value={clinic?.source_url || ''} 
              onChange={e => setClinic({ ...clinic, source_url: e.target.value })}
              placeholder="https://www.paginegialle.it/..."
            />
            {clinic?.source_url && (
              <div className="mt-2 space-y-1">
                <p className="text-xs text-muted-foreground">
                  🔗 Dati provenienti da: {clinic.source_url}
                </p>
                {clinic?.source_url_status && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold">Status:</span>
                    {clinic.source_url_status === 'verified' ? (
                      <span className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded">✅ Verificata</span>
                    ) : clinic.source_url_status === 'not_found' ? (
                      <span className="text-xs px-2 py-1 bg-red-100 text-red-800 rounded">❌ Non trovata (404)</span>
                    ) : clinic.source_url_status?.startsWith('error_') ? (
                      <span className="text-xs px-2 py-1 bg-orange-100 text-orange-800 rounded">⚠️ Errore: {clinic.source_url_status}</span>
                    ) : (
                      <span className="text-xs px-2 py-1 bg-gray-100 text-gray-800 rounded">❓ {clinic.source_url_status}</span>
                    )}
                  </div>
                )}
                {clinic?.source_url_verified_at && (
                  <p className="text-xs text-muted-foreground">
                    Verificata il: {new Date(clinic.source_url_verified_at).toLocaleString('it-IT')}
                  </p>
                )}
                {clinic?.source_url_status && clinic.source_url_status !== 'verified' && (
                  <p className="text-xs text-orange-600 mt-1">
                    💡 Puoi modificare la URL sopra e salvarla per aggiornare la sorgente
                  </p>
                )}
              </div>
            )}
          </Field>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={saveClinic} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />} Salva
          </Button>
          <Button variant="outline" onClick={loadClinic} disabled={loading}>
            <RefreshCcw className="w-4 h-4 mr-2" /> Ricarica
          </Button>
          {clinic?.id && (
            <>
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" disabled={loading}>
                    <RefreshCcw className="w-4 h-4 mr-2" /> Refresh Completo
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Refresh Completo Clinica</DialogTitle>
                    <DialogDescription>
                      Esegui il refresh completo della clinica con tutti gli arricchimenti
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-semibold mb-2">Informazioni Clinica</h4>
                      <div className="space-y-1 text-sm">
                        <p><strong>Nome:</strong> {clinic?.name}</p>
                        <p><strong>ID:</strong> {clinic?.id}</p>
                        <p><strong>Slug:</strong> {clinic?.slug}</p>
                        {clinic?.source_url && (
                          <p><strong>Source URL (PagineGialle):</strong> 
                            <a href={clinic.source_url} target="_blank" rel="noopener noreferrer" className="ml-2 text-blue-600 hover:underline">
                              {clinic.source_url}
                              <ExternalLink className="inline w-3 h-3 ml-1" />
                            </a>
                          </p>
                        )}
                        {clinic?.website && (
                          <p><strong>Website:</strong> 
                            <a href={clinic.website.startsWith('http') ? clinic.website : `https://${clinic.website}`} target="_blank" rel="noopener noreferrer" className="ml-2 text-blue-600 hover:underline">
                              {clinic.website}
                              <ExternalLink className="inline w-3 h-3 ml-1" />
                            </a>
                          </p>
                        )}
                      </div>
                    </div>
                    <div>
                      <h4 className="font-semibold mb-2">Comando da eseguire</h4>
                      <div className="bg-muted p-3 rounded-lg font-mono text-xs relative">
                        <code className="block break-all">
                          python3 codebase/SPIDER/refresh_clinic_complete.py --slug {clinic?.slug}
                        </code>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="absolute top-2 right-2"
                          onClick={async () => {
                            const cmd = `python3 codebase/SPIDER/refresh_clinic_complete.py --slug ${clinic?.slug}`
                            await navigator.clipboard?.writeText(cmd)
                            toast({ title: 'Comando copiato negli appunti' })
                          }}
                        >
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <p className="text-sm text-blue-900">
                        <strong>Nota:</strong> Questo comando eseguirà:
                        <ul className="list-disc list-inside mt-2 space-y-1">
                          {clinic?.source_url && <li>Scraping PagineGialle</li>}
                          {clinic?.source_url && <li>Estrazione recensioni PagineGialle</li>}
                          <li>Arricchimento Google My Business</li>
                          <li>Analisi DeepSeek</li>
                          <li>Spidering sito web (prezzi + immagini)</li>
                        </ul>
                      </p>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" disabled={loading}>
                    <Sparkles className="w-4 h-4 mr-2" /> Arricchimenti Singoli
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Arricchimenti Singoli</DialogTitle>
                    <DialogDescription>
                      Esegui singoli arricchimenti per questa clinica
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {/* PagineGialle */}
                      {clinic?.source_url && (
                        <EnrichmentDialogButton
                          title="PagineGialle"
                          description="Scraping e recensioni da PagineGialle"
                          icon={<MessageSquare className="w-4 h-4" />}
                          command={`python3 codebase/SPIDER/scrape_paginegialle_reviews.py --clinic-id ${clinic.id} --url "${clinic.source_url}"`}
                          endpoint="/api/enrich/paginegialle"
                          clinicId={clinic.id}
                          extraData={{ source_url: clinic.source_url }}
                          toast={toast}
                          disabled={!clinic.source_url}
                        />
                      )}
                      {/* GMB */}
                      <EnrichmentDialogButton
                        title="Google My Business"
                        description="Arricchimento dati GMB (include orari)"
                        icon={<MapPin className="w-4 h-4" />}
                        command={`python3 codebase/SPIDER/arricchisci-clinic-gmb.py --clinic-id ${clinic.id}`}
                        endpoint="/api/enrich/gmb"
                        clinicId={clinic.id}
                        toast={toast}
                        onSuccess={async (data) => {
                          // Ricarica la clinica per ottenere gli orari aggiornati
                          if (data.success) {
                            await loadClinic()
                          }
                        }}
                      />
                      {/* Website */}
                      {clinic?.website && (
                        <EnrichmentDialogButton
                          title="Website Spidering"
                          description="Estrazione prezzi e immagini dal sito"
                          icon={<Globe className="w-4 h-4" />}
                          command={`python3 codebase/SPIDER/arricchisci-clinic-website-prices.py --clinic-id ${clinic.id}`}
                          endpoint="/api/enrich/website"
                          clinicId={clinic.id}
                          toast={toast}
                          disabled={!clinic.website}
                        />
                      )}
                      {/* DeepSeek */}
                      <EnrichmentDialogButton
                        title="DeepSeek Analysis"
                        description="Analisi sentiment recensioni"
                        icon={<Brain className="w-4 h-4" />}
                        command={`python3 codebase/SPIDER/update-withdeepseek.py --clinic-id ${clinic.id}`}
                        endpoint="/api/enrich/deepseek"
                        clinicId={clinic.id}
                        toast={toast}
                      />
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )

  const renderHoursView = () => (
    <Card>
      <CardHeader>
        <CardTitle>Orari di Apertura</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          {clinic?.hours && Object.keys(clinic.hours).length > 0 ? (
            <div className="space-y-2">
              {Object.entries(clinic.hours).map(([day, slots]) => (
                <div key={day} className="flex items-center gap-2">
                  <span className="w-24 text-sm font-medium">{day}:</span>
                  <Input
                    value={Array.isArray(slots) ? slots.join(', ') : String(slots || '')}
                    onChange={(e) => {
                      const value = e.target.value
                      const newSlots = value.split(',').map(s => s.trim()).filter(Boolean)
                      setClinic({
                        ...clinic,
                        hours: {
                          ...clinic.hours,
                          [day]: newSlots.length > 0 ? newSlots : null
                        }
                      })
                    }}
                    placeholder="es: 09:00-12:00, 15:00-19:00"
                    className="flex-1"
                  />
                </div>
              ))}
              {/* Verifica H24 */}
              {(() => {
                const isH24 = Object.values(clinic.hours || {}).some(slots => 
                  Array.isArray(slots) && slots.some(slot => 
                    slot && (slot.includes('00:00-00:00') || slot.includes('24:00') || slot.toLowerCase().includes('h24'))
                  )
                )
                return isH24 && (
                  <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded">
                    <span className="text-sm font-semibold text-green-800">✅ Aperto H24</span>
                  </div>
                )
              })()}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground p-3 bg-gray-50 rounded border">
              Nessun orario configurato. Gli orari vengono recuperati automaticamente durante l'arricchimento da GMB, PagineGialle o FNOVI.
            </div>
          )}
          <div className="flex gap-2 flex-wrap">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={async () => {
                if (!clinic?.id) {
                  toast({ variant: 'destructive', title: 'Errore', description: 'Carica prima una clinica' })
                  return
                }
                setLoading(true)
                try {
                  const response = await fetch(`${API_BASE_URL}/api/enrich/gmb`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ clinic_id: clinic.id })
                  })
                  const data = await response.json()
                  if (data.success) {
                    // Se ci sono orari nel risultato, aggiornali
                    if (data.result?.hours) {
                      setClinic({ ...clinic, hours: data.result.hours })
                      toast({ title: '✅ Orari recuperati da GMB', description: 'Gli orari sono stati aggiornati' })
                    } else {
                      // Altrimenti ricarica la clinica per ottenere gli orari aggiornati
                      await loadClinic()
                      toast({ title: '✅ Arricchimento GMB completato', description: 'Gli orari sono stati aggiornati' })
                    }
                  } else {
                    toast({ variant: 'destructive', title: 'Errore', description: data.error?.join(', ') || 'Impossibile recuperare gli orari da GMB' })
                  }
                } catch (error) {
                  toast({ variant: 'destructive', title: 'Errore', description: error.message })
                } finally {
                  setLoading(false)
                }
              }}
              disabled={loading || !clinic?.id}
            >
              <MapPin className="w-4 h-4 mr-2" /> Recupera da GMB
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const defaultHours = {
                  'Lunedì': ['09:00-12:00', '15:00-19:00'],
                  'Martedì': ['09:00-12:00', '15:00-19:00'],
                  'Mercoledì': ['09:00-12:00', '15:00-19:00'],
                  'Giovedì': ['09:00-12:00', '15:00-19:00'],
                  'Venerdì': ['09:00-12:00', '15:00-19:00'],
                  'Sabato': ['09:00-12:00'],
                  'Domenica': []
                }
                setClinic({ ...clinic, hours: defaultHours })
              }}
              disabled={loading}
            >
              <Plus className="w-4 h-4 mr-2" /> Template Standard
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setClinic({ ...clinic, hours: { 'Lunedì': ['00:00-00:00'], 'Martedì': ['00:00-00:00'], 'Mercoledì': ['00:00-00:00'], 'Giovedì': ['00:00-00:00'], 'Venerdì': ['00:00-00:00'], 'Sabato': ['00:00-00:00'], 'Domenica': ['00:00-00:00'] } })
              }}
              disabled={loading}
            >
              <Clock className="w-4 h-4 mr-2" /> Imposta H24
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 pt-4 border-t">
          <Button onClick={saveClinic} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />} Salva Orari
          </Button>
          <Button variant="outline" onClick={loadClinic} disabled={loading}>
            <RefreshCcw className="w-4 h-4 mr-2" /> Ricarica
          </Button>
        </div>
      </CardContent>
    </Card>
  )

  const renderServicesView = () => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Servizi proposti</CardTitle>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setServices(prev => [...prev, { service_id: null, price: '', animal_type: 'cane' }])}
        >
          <Plus className="w-4 h-4 mr-2" /> Aggiungi
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {services.length === 0 && <p className="text-sm text-muted-foreground">Nessun servizio collegato.</p>}
        {services.map((srv, idx) => (
          <div key={idx} className="grid md:grid-cols-4 gap-3 border rounded-lg p-3">
            <Select
              value={srv.service_id || ''}
              onValueChange={val => {
                const meta = servicesTax.find(s => s.id === val)
                setServices(prev => prev.map((item, i) => (i === idx ? { ...item, service_id: val, service_name: meta?.name } : item)))
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleziona servizio" />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {servicesTax.map(option => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.name} · <span className="text-xs text-muted-foreground">{option.category}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Prezzo"
              value={srv.price ?? ''}
              onChange={e => setServices(prev => prev.map((item, i) => (i === idx ? { ...item, price: e.target.value } : item)))}
            />
            <Select
              value={srv.animal_type || 'cane'}
              onValueChange={val => setServices(prev => prev.map((item, i) => (i === idx ? { ...item, animal_type: val } : item)))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cane">Cane</SelectItem>
                <SelectItem value="gatto">Gatto</SelectItem>
                <SelectItem value="esotici">Esotici</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="ghost" onClick={() => setServices(prev => prev.filter((_, i) => i !== idx))}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  )

  const renderReviewsView = () => (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle>Recensioni manuali</CardTitle>
        <Button onClick={importGoogleReviews} variant="outline" disabled={!reviews.length}>
          <Upload className="w-4 h-4 mr-2" /> Invia a Supabase
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {reviews.map((rev, idx) => (
          <div key={rev.review_id || idx} className="border rounded-lg p-3 space-y-2">
            <div className="flex gap-3">
              <Input
                type="number"
                min={1}
                max={5}
                value={rev.rating}
                onChange={e => setReviews(prev => prev.map((item, i) => (i === idx ? { ...item, rating: e.target.value } : item)))}
              />
              <Input
                placeholder="Autore"
                value={rev.author_name}
                onChange={e => setReviews(prev => prev.map((item, i) => (i === idx ? { ...item, author_name: e.target.value } : item)))}
              />
            </div>
            <Textarea
              value={rev.text}
              onChange={e => setReviews(prev => prev.map((item, i) => (i === idx ? { ...item, text: e.target.value } : item)))}
            />
          </div>
        ))}
        {!reviews.length && <p className="text-sm text-muted-foreground">Nessuna recensione disponibile.</p>}
      </CardContent>
    </Card>
  )

  const renderImagesView = () => (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle>Galleria</CardTitle>
        <label className="cursor-pointer text-sm font-medium text-slate-600">
          <input type="file" hidden onChange={e => addImage(e.target.files?.[0])} />
          <span className="inline-flex items-center gap-2"><Upload className="w-4 h-4" /> Carica</span>
        </label>
      </CardHeader>
      <CardContent>
        {images?.length ? (
          <div className="grid md:grid-cols-3 gap-4">
            {images.map((img, idx) => (
              <div key={idx} className="rounded-lg overflow-hidden border">
                <img src={img} alt="gallery" className="w-full h-48 object-cover" />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">Nessuna immagine.</p>
        )}
      </CardContent>
    </Card>
  )

  const viewsMap = {
    clinic: renderClinicView,
    hours: renderHoursView,
    services: renderServicesView,
    reviews: renderReviewsView,
    images: renderImagesView,
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Cliniche</h2>
          <p className="text-sm text-muted-foreground">
            Cerca o carica una clinica tramite slug e sovrascrivi i campi principali.
          </p>
        </div>
      </div>

      {/* Ricerca cliniche */}
      <Card>
        <CardHeader>
          <CardTitle>Ricerca Cliniche</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Cerca per nome, slug, città o indirizzo..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && searchClinics()}
                className="pl-10"
              />
            </div>
            <Button onClick={searchClinics} disabled={searching || !searchQuery.trim()}>
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </Button>
          </div>
          
          {searchResults.length > 0 && (
            <div className="mt-4 space-y-2 max-h-64 overflow-y-auto border rounded-lg p-2">
              {searchResults.map(clinic => (
                <div
                  key={clinic.id}
                  className="flex items-center justify-between p-2 hover:bg-slate-50 rounded cursor-pointer border"
                  onClick={() => {
                    setSlug(clinic.slug)
                    setSearchQuery('')
                    setSearchResults([])
                  }}
                >
                  <div>
                    <p className="font-medium">{clinic.name}</p>
                    <p className="text-xs text-muted-foreground">{clinic.address || clinic.city || clinic.slug}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={(e) => {
                    e.stopPropagation()
                    setSlug(clinic.slug)
                    setSearchQuery('')
                    setSearchResults([])
                    loadClinic()
                  }}>
                    Carica
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Carica per slug */}
      <div className="flex items-center gap-2">
        <Input placeholder="Inserisci slug clinica" value={slug} onChange={e => setSlug(e.target.value)} className="w-64" />
        <Button onClick={loadClinic} disabled={!slug || loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Carica per slug'}
        </Button>
      </div>

      {clinic ? (
        <>
          <div className="flex flex-wrap gap-2">
            {['clinic', 'hours', 'services', 'reviews', 'images'].map(viewId => (
              <Button
                key={viewId}
                variant={view === viewId ? 'default' : 'outline'}
                onClick={() => setView(viewId)}
              >
                {viewId === 'hours' ? 'orari' : viewId}
              </Button>
            ))}
          </div>
          <div>{viewsMap[view]?.()}</div>
        </>
      ) : (
        <Card>
          <CardContent className="p-6 text-muted-foreground">Nessuna clinica caricata.</CardContent>
        </Card>
      )}
    </section>
  )
}

const CMSSection = () => {
  return (
    <section>
      <h2 className="text-2xl font-semibold mb-6">CMS - Gestione Contenuti</h2>
      
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-green-600" />
              CMS Integratori
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Gestisci articoli sugli integratori per animali domestici
            </p>
            <div className="space-y-2">
              <Button asChild variant="outline" className="w-full justify-start">
                <a href="/admin-test/integratori">
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Lista Articoli
                  <ArrowRight className="h-4 w-4 ml-auto" />
                </a>
              </Button>
              <Button asChild variant="outline" className="w-full justify-start">
                <a href="/admin-test/integratori/new">
                  <Plus className="h-4 w-4 mr-2" />
                  Nuovo Articolo
                  <ArrowRight className="h-4 w-4 ml-auto" />
                </a>
              </Button>
              <Button asChild variant="outline" className="w-full justify-start">
                <a href="/admin-test/integratori/generate-ai">
                  <Sparkles className="h-4 w-4 mr-2" />
                  Genera con AI
                  <ArrowRight className="h-4 w-4 ml-auto" />
                </a>
              </Button>
              <Button asChild variant="outline" className="w-full justify-start">
                <a href="/admin-test/integratori/import">
                  <Upload className="h-4 w-4 mr-2" />
                  Importa CSV
                  <ArrowRight className="h-4 w-4 ml-auto" />
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
        
        {/* Aggiungi altri CMS qui in futuro */}
      </div>
    </section>
  )
}

const TaxonomySection = ({ toast, taxonomy, reloadTaxonomy }) => {
  const [filter, setFilter] = useState('')
  const [drafts, setDrafts] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [form, setForm] = useState({ name: '', category: '', description: '', allow_price: false, average_price: '' })
  const [localTaxonomy, setLocalTaxonomy] = useState(taxonomy)
  const [skipSync, setSkipSync] = useState(false) // Flag per saltare sincronizzazione durante modifiche locali

  // Sincronizza localTaxonomy con taxonomy prop quando cambia (solo se non stiamo facendo modifiche locali)
  useEffect(() => {
    if (skipSync) {
      console.log('⏭️  Sincronizzazione saltata (modifica locale in corso)')
      return
    }
    
    // Confronta solo gli ID per evitare loop infiniti
    const taxonomyIds = new Set((taxonomy || []).map(t => t.id).sort())
    const localIds = new Set((localTaxonomy || []).map(t => t.id).sort())
    const idsMatch = taxonomyIds.size === localIds.size && 
                     [...taxonomyIds].every(id => localIds.has(id)) &&
                     [...localIds].every(id => taxonomyIds.has(id))
    
    if (!idsMatch && taxonomy && taxonomy.length > 0) {
      // Se localTaxonomy ha MENO elementi di taxonomy, potrebbe essere che taxonomy sia vecchia
      // Non sovrascrivere se localTaxonomy ha meno elementi (potrebbe essere stato eliminato)
      if (localTaxonomy.length < taxonomy.length) {
        console.log(`⏭️  Sincronizzazione saltata: localTaxonomy ha ${localTaxonomy.length} servizi, taxonomy ha ${taxonomy.length} (possibile eliminazione in corso)`)
        return
      }
      
      console.log(`🔄 Sincronizzazione taxonomy: ${taxonomy?.length || 0} → localTaxonomy: ${localTaxonomy?.length || 0}`)
      setLocalTaxonomy(taxonomy)
      setDrafts({}) // Pulisci i drafts quando taxonomy cambia
    }
  }, [taxonomy]) // Solo taxonomy come dipendenza - skipSync è controllato dentro

  const filtered = useMemo(() => {
    if (!filter) return localTaxonomy
    const needle = filter.toLowerCase()
    return localTaxonomy.filter(item =>
      item.name.toLowerCase().includes(needle) || item.category.toLowerCase().includes(needle)
    )
  }, [filter, localTaxonomy])

  const updateDraft = (id, field, value) => {
    setDrafts(prev => ({
      ...prev,
      [id]: {
        ...(prev[id] || localTaxonomy.find(item => item.id === id) || {}),
        [field]: value,
      },
    }))
  }

  const saveDraft = async id => {
    const payload = drafts[id]
    if (!payload?.name || !payload?.category) {
      toast({ variant: 'destructive', title: 'Nome e categoria sono obbligatori' })
      return
    }
    setSubmitting(true)
    const adminClient = getAdminSupabaseClient()
    const { error } = await adminClient
      .from('pharmacy_services_taxonomy')
      .update({
        name: payload.name.trim(),
        category: payload.category.trim(),
        description: payload.description?.trim() || null,
        allow_price: !!payload.allow_price,
        average_price: payload.average_price ? parseFloat(payload.average_price) : null,
      })
      .eq('id', id)
    setSubmitting(false)
    if (error) {
      toast({ variant: 'destructive', title: 'Errore aggiornando servizio', description: error.message })
      console.error('Errore aggiornamento servizio:', error)
    } else {
      // DISABILITA sincronizzazione temporaneamente
      setSkipSync(true)
      
      // AGGIORNA IMMEDIATAMENTE lo stato locale con i nuovi valori
      const currentItem = localTaxonomy.find(item => item.id === id)
      const updatedItem = {
        ...currentItem,
        name: payload.name.trim(),
        category: payload.category.trim(),
        description: payload.description?.trim() || null,
        allow_price: !!payload.allow_price,
        average_price: payload.average_price ? parseFloat(payload.average_price) : null,
      }
      const updatedTaxonomy = localTaxonomy.map(item => 
        item.id === id ? updatedItem : item
      )
      setLocalTaxonomy(updatedTaxonomy) // AGGIORNA SUBITO!
      console.log(`💾 Servizio aggiornato IMMEDIATAMENTE in localTaxonomy:`, updatedItem.name)
      
      // Rimuovi il draft
      setDrafts(prev => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      
      toast({ title: 'Servizio aggiornato con successo' })
      
      // Ricarica i dati in background DOPO (non bloccare l'UI)
      setTimeout(async () => {
        try {
          const { data: freshData, error: reloadError } = await supabase
            .from('pharmacy_services_taxonomy')
            .select('*')
            .order('category', { ascending: true })
            .order('name', { ascending: true })
          
          if (!reloadError && freshData) {
            console.log(`✅ Sincronizzazione DB completata: ${freshData?.length || 0} servizi`)
            // Aggiorna con i dati freschi dal DB
            setLocalTaxonomy(freshData || [])
            // Aggiorna anche lo stato globale (dopo aver aggiornato localTaxonomy)
            await reloadTaxonomy()
            // Riabilita sincronizzazione DOPO reloadTaxonomy con un piccolo delay
            setTimeout(() => setSkipSync(false), 100)
          } else {
            setSkipSync(false)
          }
        } catch (reloadError) {
          console.error('Errore sincronizzazione:', reloadError)
          setSkipSync(false)
        }
      }, 500)
    }
  }

  const deleteService = async id => {
    if (!confirm('Sei sicuro di voler eliminare questo servizio? L\'operazione è irreversibile.')) {
      return
    }
    
    setDeleting(id)
    // DISABILITA sincronizzazione PRIMA di fare qualsiasi modifica
    setSkipSync(true)
    
    // Usa client admin per bypassare RLS
    const adminClient = getAdminSupabaseClient()
    const isAdminClient = adminClient !== supabase
    console.log(`🔍 Client admin (bypass RLS: ${isAdminClient})`)
    
    // Test: verifica che il servizio esista prima di eliminarlo
    const { data: existingItem } = await adminClient
      .from('pharmacy_services_taxonomy')
      .select('id, name')
      .eq('id', id)
      .maybeSingle()
    
    if (!existingItem) {
      setSkipSync(false)
      setDeleting(null)
      toast({ variant: 'destructive', title: 'Errore', description: 'Servizio non trovato nel database' })
      return
    }
    
    console.log(`🗑️  Eliminazione servizio: ${existingItem.name} (id: ${id})`)
    
    // Elimina dal database
    console.log('🔍 Inizio chiamata delete...')
    const { data: deleteResult, error } = await adminClient
      .from('pharmacy_services_taxonomy')
      .delete()
      .eq('id', id)
      .select() // Restituisce i dati eliminati per conferma
    
    console.log('🔍 Risultato delete completo:', {
      data: deleteResult,
      error,
      hasError: !!error,
      hasData: !!deleteResult,
      dataLength: deleteResult?.length
    })
    
    if (error) {
      setSkipSync(false)
      setDeleting(null)
      toast({ variant: 'destructive', title: 'Errore eliminazione', description: error.message })
      console.error('❌ Errore eliminazione servizio:', {
        error,
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      })
      return
    }
    
    // Se deleteResult è vuoto, significa che nessuna riga è stata eliminata
    if (!deleteResult || deleteResult.length === 0) {
      console.error('❌ PROBLEMA: Delete ha restituito array vuoto - nessuna riga eliminata!')
      console.error('❌ Questo potrebbe indicare:')
      console.error('   1. Problema di permessi (RLS - Row Level Security)')
      console.error('   2. ID non trovato (ma abbiamo verificato che esiste)')
      console.error('   3. Vincoli di foreign key che prevengono eliminazione')
      
      setSkipSync(false)
      setDeleting(null)
      toast({ 
        variant: 'destructive', 
        title: 'Errore eliminazione', 
        description: 'Il servizio non è stato eliminato. Verifica i permessi o i vincoli del database.' 
      })
      return
    }
    
    console.log(`✅ Servizio eliminato dal DB. Risultato:`, deleteResult)
    
    // Se successo, rimuovi IMMEDIATAMENTE dallo stato locale per feedback visivo
    const newLocalTaxonomy = localTaxonomy.filter(item => item.id !== id)
    setLocalTaxonomy(newLocalTaxonomy)
    console.log(`✅ Servizio rimosso localmente: ${newLocalTaxonomy.length} servizi rimasti (era ${localTaxonomy.length})`)
    
    setDrafts(prev => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    
    setDeleting(null)
    toast({ title: 'Servizio eliminato con successo' })
    
    // NON chiamare reloadTaxonomy() subito - aspetta un po' per evitare problemi di replica DB
    // E riabilita sync solo quando siamo sicuri che i dati sono sincronizzati
    setTimeout(async () => {
      // Verifica che il servizio sia effettivamente eliminato dal DB
      console.log('🔍 Verifica post-eliminazione: controllo se il servizio esiste ancora...')
      const { data: checkItem, error: checkError } = await supabase
        .from('pharmacy_services_taxonomy')
        .select('id, name')
        .eq('id', id)
        .maybeSingle()
      
      console.log('🔍 Risultato verifica:', {
        checkItem,
        checkError,
        exists: !!checkItem,
        itemName: checkItem?.name
      })
      
      if (checkItem) {
        console.error(`❌ PROBLEMA CRITICO: Servizio ancora presente nel DB dopo eliminazione!`)
        console.error(`   ID: ${id}`)
        console.error(`   Nome: ${checkItem.name}`)
        console.error(`   Questo indica che la DELETE non ha funzionato.`)
        console.error(`   Possibili cause:`)
        console.error(`   1. RLS (Row Level Security) blocca l'eliminazione`)
        console.error(`   2. Foreign key constraints prevengono eliminazione`)
        console.error(`   3. Problema di permessi utente`)
        
        toast({ 
          variant: 'destructive', 
          title: 'Errore eliminazione', 
          description: `Il servizio "${checkItem.name}" è ancora presente nel database. Verifica permessi RLS o vincoli.` 
        })
      } else {
        console.log(`✅ Servizio confermato eliminato dal DB`)
      }
      
      // Aggiorna lo stato globale SOLO se necessario (senza forzare sincronizzazione)
      await reloadTaxonomy()
      
      // Riabilita sincronizzazione DOPO un delay per evitare conflitti
      setTimeout(() => {
        setSkipSync(false)
        console.log('✅ Sincronizzazione riabilitata')
      }, 500)
    }, 1000) // Aumentato a 1 secondo per dare tempo al DB
  }

  const handleCsvUpload = async e => {
    const file = e.target.files?.[0]
    if (!file) return

    const text = await file.text()
    const lines = text.split('\n').filter(line => line.trim())
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase())

    const nameIdx = headers.findIndex(h => h === 'name' || h === 'nome')
    const categoryIdx = headers.findIndex(h => h === 'category' || h === 'categoria')
    const descriptionIdx = headers.findIndex(h => h === 'description' || h === 'descrizione')
    const allowPriceIdx = headers.findIndex(h => h === 'allow_price' || h === 'abilita_prezzo')
    const averagePriceIdx = headers.findIndex(h => h === 'average_price' || h === 'prezzo_medio')

    if (nameIdx === -1 || categoryIdx === -1) {
      toast({ variant: 'destructive', title: 'CSV non valido', description: 'Il CSV deve contenere almeno le colonne "name" e "category"' })
      return
    }

    const rows = lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim())
      return {
        name: values[nameIdx] || '',
        category: values[categoryIdx] || '',
        description: values[descriptionIdx] || null,
        allow_price: allowPriceIdx !== -1 ? (values[allowPriceIdx]?.toLowerCase() === 'true' || values[allowPriceIdx] === '1') : false,
        average_price: averagePriceIdx !== -1 && values[averagePriceIdx] ? parseFloat(values[averagePriceIdx]) : null,
      }
    }).filter(row => row.name && row.category)

    if (rows.length === 0) {
      toast({ variant: 'destructive', title: 'Nessun dato valido', description: 'Il CSV non contiene righe valide' })
      return
    }

    setSubmitting(true)
    const adminClient = getAdminSupabaseClient()
    // Usa upsert con ignoreDuplicates per evitare errori su duplicati
    const { error } = await adminClient.from('pharmacy_services_taxonomy').upsert(rows, { 
      onConflict: 'name,category',
      ignoreDuplicates: false 
    })
    
    if (error) {
      setSubmitting(false)
      toast({ variant: 'destructive', title: 'Errore import CSV', description: error.message })
      console.error('Errore import CSV:', error)
    } else {
      // Ricarica i dati
      await new Promise(resolve => setTimeout(resolve, 200))
      const { data: freshData } = await supabase
        .from('pharmacy_services_taxonomy')
        .select('*')
        .order('category', { ascending: true })
        .order('name', { ascending: true })
      
      if (freshData) {
        setLocalTaxonomy(freshData || [])
        console.log(`✅ Tassonomia ricaricata dopo import CSV: ${freshData?.length || 0} servizi`)
      }
      
      await reloadTaxonomy()
      setSubmitting(false)
      toast({ title: `${rows.length} servizi importati/aggiornati da CSV` })
    }
  }

  const addService = async () => {
    if (!form.name || !form.category) {
      toast({ variant: 'destructive', title: 'Nome e categoria obbligatori' })
      return
    }
    setSubmitting(true)
    const adminClient = getAdminSupabaseClient()
    const { data: newService, error } = await adminClient.from('pharmacy_services_taxonomy').insert({
      name: form.name.trim(),
      category: form.category.trim(),
      description: form.description?.trim() || null,
      allow_price: form.allow_price,
      average_price: form.average_price ? parseFloat(form.average_price) : null,
    }).select().single()
    
    if (error) {
      setSubmitting(false)
      toast({ variant: 'destructive', title: 'Errore creazione servizio', description: error.message })
      console.error('Errore creazione servizio:', error)
    } else {
      // DISABILITA sincronizzazione temporaneamente
      setSkipSync(true)
      
      // Aggiungi immediatamente allo stato locale
      if (newService) {
        const updatedTaxonomy = [...localTaxonomy, newService].sort((a, b) => {
          if (a.category !== b.category) return a.category.localeCompare(b.category)
          return a.name.localeCompare(b.name)
        })
        setLocalTaxonomy(updatedTaxonomy)
        console.log(`➕ Servizio aggiunto localmente: ${newService.name} (totale: ${updatedTaxonomy.length})`)
      }
      
      setForm({ name: '', category: '', description: '', allow_price: false, average_price: '' })
      setSubmitting(false)
      toast({ title: 'Servizio inserito con successo' })
      
      // Ricarica i dati completi in background per sincronizzazione
      setTimeout(async () => {
        const { data: freshData } = await supabase
          .from('pharmacy_services_taxonomy')
          .select('*')
          .order('category', { ascending: true })
          .order('name', { ascending: true })
        
        if (freshData) {
          setLocalTaxonomy(freshData || [])
          console.log(`✅ Dati sincronizzati da DB: ${freshData?.length || 0} servizi`)
        }
        // Riabilita sincronizzazione
        setSkipSync(false)
        await reloadTaxonomy()
      }, 300)
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Tassonomia servizi</h2>
          <p className="text-sm text-muted-foreground">Gestisci le prestazioni disponibili e abilita il prezzo.</p>
        </div>
        <div className="ml-auto flex gap-2">
          <Input
            placeholder="Filtro per nome o categoria"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="w-64"
          />
          <label className="cursor-pointer">
            <input type="file" accept=".csv" hidden onChange={handleCsvUpload} />
            <Button variant="outline" type="button" disabled={submitting}>
              <FileSpreadsheet className="w-4 h-4 mr-2" /> Importa CSV
            </Button>
          </label>
          <Button variant="outline" onClick={reloadTaxonomy}>
            <RefreshCcw className="w-4 h-4 mr-2" /> Ricarica
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nuovo servizio</CardTitle>
        </CardHeader>
        <CardContent className="grid md:grid-cols-5 gap-3">
          <Input placeholder="Nome" value={form.name} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))} />
          <Input
            placeholder="Categoria"
            value={form.category}
            onChange={e => setForm(prev => ({ ...prev, category: e.target.value }))}
          />
          <Input
            type="number"
            step="0.01"
            placeholder="Prezzo medio (€)"
            value={form.average_price}
            onChange={e => setForm(prev => ({ ...prev, average_price: e.target.value }))}
          />
          <div className="flex items-center gap-2">
            <Switch
              checked={form.allow_price}
              onCheckedChange={val => setForm(prev => ({ ...prev, allow_price: val }))}
            />
            <span className="text-sm">Abilita prezzo</span>
          </div>
          <Textarea
            placeholder="Descrizione (facoltativa)"
            value={form.description}
            onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
            className="md:col-span-5"
          />
          <Button className="md:col-span-5" onClick={addService} disabled={submitting}>
            {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />} Aggiungi
          </Button>
        </CardContent>
      </Card>

      <div className="overflow-x-auto border rounded-xl">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="text-left px-4 py-2 w-[300px]">Nome</th>
              <th className="text-left px-4 py-2">Categoria</th>
              <th className="text-left px-4 py-2">Descrizione</th>
              <th className="text-left px-4 py-2 w-[120px]">Prezzo medio (€)</th>
              <th className="text-left px-4 py-2 w-[100px]">Prezzo?</th>
              <th className="text-left px-4 py-2">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(item => {
              const draft = drafts[item.id]
              return (
                <tr key={item.id} className="border-t">
                  <td className="px-4 py-2 w-[300px]">
                    <Textarea
                      value={draft?.name ?? item.name}
                      onChange={e => updateDraft(item.id, 'name', e.target.value)}
                      className="min-h-[80px] resize-y w-full"
                      placeholder="Nome servizio"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <Input
                      value={draft?.category ?? item.category}
                      onChange={e => updateDraft(item.id, 'category', e.target.value)}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <Textarea
                      value={draft?.description ?? item.description ?? ''}
                      onChange={e => updateDraft(item.id, 'description', e.target.value)}
                    />
                  </td>
                  <td className="px-4 py-2 w-[120px]">
                    <Input
                      type="number"
                      step="0.01"
                      value={(() => {
                        if (draft?.average_price !== undefined) {
                          return draft.average_price === null || draft.average_price === undefined ? '' : String(draft.average_price)
                        }
                        return item.average_price === null || item.average_price === undefined ? '' : String(item.average_price)
                      })()}
                      onChange={e => updateDraft(item.id, 'average_price', e.target.value)}
                      placeholder="0.00"
                      className="w-full"
                    />
                  </td>
                  <td className="px-4 py-2 w-[100px]">
                    <Switch
                      checked={draft?.allow_price ?? item.allow_price}
                      onCheckedChange={val => updateDraft(item.id, 'allow_price', val)}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => saveDraft(item.id)}>
                        <Save className="w-4 h-4 mr-1" /> Salva
                      </Button>
                      {drafts[item.id] && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDrafts(prev => {
                            const next = { ...prev }
                            delete next[item.id]
                            return next
                          })}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => deleteService(item.id)}
                        disabled={deleting === item.id}
                      >
                        {deleting === item.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {!filtered.length && (
              <tr>
                <td colSpan={6} className="text-center py-6 text-muted-foreground">
                  Nessun servizio trovato.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

const PharmaciesSection = ({ toast, servicesTax }) => {
  const [slug, setSlug] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [view, setView] = useState('pharmacy')
  const [loading, setLoading] = useState(false)
  const [pharmacy, setPharmacy] = useState(null)
  const [reviews, setReviews] = useState([])
  
  const searchPharmacies = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      return
    }
    setSearching(true)
    const query = searchQuery.trim().toLowerCase()
    const adminClient = getAdminSupabaseClient()
    const { data, error } = await adminClient
      .from('paginegialle_pharmacies')
      .select('id, name, prontofarmacie_slug, address, city')
      .or(`name.ilike.%${query}%,prontofarmacie_slug.ilike.%${query}%,address.ilike.%${query}%,city.ilike.%${query}%`)
      .limit(20)
    
    setSearching(false)
    if (error) {
      toast({ variant: 'destructive', title: 'Errore ricerca', description: error.message })
    } else {
      setSearchResults(data || [])
    }
  }

  const loadPharmacy = async () => {
    if (!slug) return
    setLoading(true)
    try {
      const adminClient = getAdminSupabaseClient()
      const { data, error } = await adminClient
        .from('paginegialle_pharmacies')
        .select('*')
        .eq('prontofarmacie_slug', slug)
        .maybeSingle()
      
      if (error) {
        console.error('Errore caricamento farmacia:', error)
        toast({ variant: 'destructive', title: 'Errore caricando farmacia', description: error.message })
        setLoading(false)
        return
      }
      
      if (!data) {
        toast({ variant: 'destructive', title: 'Farmacia non trovata', description: `Nessuna farmacia trovata con slug: ${slug}` })
        setLoading(false)
        return
      }
      
      setPharmacy(data)
      
      // Carica recensioni
      const { data: reviewsData, error: reviewsError } = await adminClient
        .from('google_reviews_pg')
        .select('*')
        .eq('pharmacy_id', data.id)
        .order('created_at_g', { ascending: false })
        .limit(10)
      
      if (!reviewsError && reviewsData) {
        setReviews(reviewsData.map(r => ({
          review_id: r.id,
          rating: r.star_rating,
          text: r.comment,
          author_name: r.reviewer_name,
          profile_photo_url: r.reviewer_photo,
          time: r.created_at_g,
          source: r.source || 'google',
        })))
      }
      
      setLoading(false)
      toast({ title: 'Farmacia caricata' })
    } catch (err) {
      console.error('Errore caricamento farmacia:', err)
      toast({ variant: 'destructive', title: 'Errore caricando farmacia', description: err.message || 'Errore sconosciuto' })
      setLoading(false)
    }
  }

  const savePharmacy = async () => {
    if (!pharmacy) return
    if (!pharmacy.name || !pharmacy.address) {
      toast({ variant: 'destructive', title: 'Inserisci nome e indirizzo' })
      return
    }

    setLoading(true)
    const adminClient = getAdminSupabaseClient()
    const { error } = await adminClient
      .from('paginegialle_pharmacies')
      .update({
        name: pharmacy.name,
        prontofarmacie_slug: pharmacy.prontofarmacie_slug,
        address: pharmacy.address,
        city: pharmacy.city,
        province: pharmacy.province,
        phone: pharmacy.phone,
        email: pharmacy.email,
        website: pharmacy.website ? (pharmacy.website.startsWith('http') ? pharmacy.website : `https://${pharmacy.website}`) : null,
        latitude: pharmacy.latitude,
        longitude: pharmacy.longitude,
        opening_hours: pharmacy.opening_hours,
        place_id: pharmacy.place_id,
        maps_url: pharmacy.maps_url,
        rating_avg_cached: pharmacy.rating_avg_cached,
        rating_count_cached: pharmacy.rating_count_cached,
        description: pharmacy.description || null,
      })
      .eq('id', pharmacy.id)
    
    if (error) {
      setLoading(false)
      toast({ variant: 'destructive', title: 'Errore salvataggio', description: error.message })
      return
    }
    
    setLoading(false)
    toast({ title: 'Farmacia salvata con successo' })
    await loadPharmacy()
  }

  const renderPharmacyView = () => (
    <Card>
      <CardHeader>
        <CardTitle>Dati farmacia</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Nome">
            <Input value={pharmacy?.name || ''} onChange={e => setPharmacy({ ...pharmacy, name: e.target.value })} />
          </Field>
          <Field label="Slug">
            <Input value={pharmacy?.prontofarmacie_slug || ''} onChange={e => setPharmacy({ ...pharmacy, prontofarmacie_slug: e.target.value })} />
          </Field>
          <Field label="Telefono">
            <Input value={pharmacy?.phone || ''} onChange={e => setPharmacy({ ...pharmacy, phone: e.target.value })} />
          </Field>
          <Field label="Email">
            <Input value={pharmacy?.email || ''} onChange={e => setPharmacy({ ...pharmacy, email: e.target.value })} />
          </Field>
          <Field label="Indirizzo completo" className="md:col-span-2">
            <Textarea value={pharmacy?.address || ''} onChange={e => setPharmacy({ ...pharmacy, address: e.target.value })} />
          </Field>
          <Field label="Città">
            <Input value={pharmacy?.city || ''} onChange={e => setPharmacy({ ...pharmacy, city: e.target.value })} />
          </Field>
          <Field label="Provincia">
            <Input value={pharmacy?.province || ''} onChange={e => setPharmacy({ ...pharmacy, province: e.target.value })} />
          </Field>
          <Field label="Website">
            <Input value={pharmacy?.website || ''} onChange={e => setPharmacy({ ...pharmacy, website: e.target.value })} />
          </Field>
          <Field label="Place ID">
            <Input value={pharmacy?.place_id || ''} onChange={e => setPharmacy({ ...pharmacy, place_id: e.target.value })} />
          </Field>
          <Field label="Latitude">
            <Input type="number" step="any" value={pharmacy?.latitude || ''} onChange={e => setPharmacy({ ...pharmacy, latitude: e.target.value ? parseFloat(e.target.value) : null })} />
          </Field>
          <Field label="Longitude">
            <Input type="number" step="any" value={pharmacy?.longitude || ''} onChange={e => setPharmacy({ ...pharmacy, longitude: e.target.value ? parseFloat(e.target.value) : null })} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={savePharmacy} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />} Salva
          </Button>
          <Button variant="outline" onClick={loadPharmacy} disabled={loading}>
            <RefreshCcw className="w-4 h-4 mr-2" /> Ricarica
          </Button>
        </div>
      </CardContent>
    </Card>
  )

  const renderHoursView = () => (
    <Card>
      <CardHeader>
        <CardTitle>Orari di Apertura</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          {pharmacy?.opening_hours && Object.keys(pharmacy.opening_hours).length > 0 ? (
            <div className="space-y-2">
              {Object.entries(pharmacy.opening_hours).map(([day, slots]) => (
                <div key={day} className="flex items-center gap-2">
                  <span className="w-24 text-sm font-medium">{day}:</span>
                  <Input
                    value={Array.isArray(slots) ? slots.join(', ') : String(slots || '')}
                    onChange={(e) => {
                      const value = e.target.value
                      const newSlots = value.split(',').map(s => s.trim()).filter(Boolean)
                      setPharmacy({
                        ...pharmacy,
                        opening_hours: {
                          ...pharmacy.opening_hours,
                          [day]: newSlots.length > 0 ? newSlots : null
                        }
                      })
                    }}
                    placeholder="es: 09:00-12:00, 15:00-19:00"
                    className="flex-1"
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground p-3 bg-gray-50 rounded border">
              Nessun orario configurato.
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2 pt-4 border-t">
          <Button onClick={savePharmacy} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />} Salva Orari
          </Button>
          <Button variant="outline" onClick={loadPharmacy} disabled={loading}>
            <RefreshCcw className="w-4 h-4 mr-2" /> Ricarica
          </Button>
        </div>
      </CardContent>
    </Card>
  )

  const renderReviewsView = () => (
    <Card>
      <CardHeader>
        <CardTitle>Recensioni</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {reviews.map((rev, idx) => (
          <div key={rev.review_id || idx} className="border rounded-lg p-3 space-y-2">
            <div className="flex gap-3">
              <Input
                type="number"
                min={1}
                max={5}
                value={rev.rating}
                onChange={e => setReviews(prev => prev.map((item, i) => (i === idx ? { ...item, rating: e.target.value } : item)))}
              />
              <Input
                placeholder="Autore"
                value={rev.author_name}
                onChange={e => setReviews(prev => prev.map((item, i) => (i === idx ? { ...item, author_name: e.target.value } : item)))}
              />
            </div>
            <Textarea
              value={rev.text}
              onChange={e => setReviews(prev => prev.map((item, i) => (i === idx ? { ...item, text: e.target.value } : item)))}
            />
          </div>
        ))}
        {!reviews.length && <p className="text-sm text-muted-foreground">Nessuna recensione disponibile.</p>}
      </CardContent>
    </Card>
  )

  const renderDescriptionView = () => {
    const [showPreview, setShowPreview] = useState(false)
    
    return (
      <Card>
        <CardHeader>
          <CardTitle>Descrizione HTML</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Modifica la descrizione HTML della farmacia. Puoi usare tag HTML standard come &lt;p&gt;, &lt;strong&gt;, &lt;em&gt;, &lt;ul&gt;, &lt;li&gt;, ecc.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPreview(!showPreview)}
            >
              {showPreview ? 'Nascondi' : 'Mostra'} Anteprima
            </Button>
          </div>
          
          {showPreview && pharmacy?.description && (
            <div className="border rounded-lg p-4 bg-white">
              <h4 className="text-sm font-semibold mb-2 text-muted-foreground">Anteprima:</h4>
              <div 
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: pharmacy.description || '' }}
              />
            </div>
          )}
          
          <Field label="HTML Description" className="md:col-span-2">
            <Textarea
              value={pharmacy?.description || ''}
              onChange={e => setPharmacy({ ...pharmacy, description: e.target.value })}
              placeholder="<p>Inserisci qui la descrizione HTML della farmacia...</p>"
              className="min-h-[400px] font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground mt-2">
              💡 Suggerimenti: Usa &lt;p&gt; per paragrafi, &lt;strong&gt; per testo in grassetto, &lt;em&gt; per testo in corsivo, &lt;ul&gt; e &lt;li&gt; per liste.
            </p>
          </Field>
          
          <div className="flex flex-wrap gap-2 pt-4 border-t">
            <Button onClick={savePharmacy} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />} Salva Descrizione
            </Button>
            <Button variant="outline" onClick={loadPharmacy} disabled={loading}>
              <RefreshCcw className="w-4 h-4 mr-2" /> Ricarica
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  const viewsMap = {
    pharmacy: renderPharmacyView,
    hours: renderHoursView,
    reviews: renderReviewsView,
    description: renderDescriptionView,
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Farmacie</h2>
          <p className="text-sm text-muted-foreground">
            Cerca o carica una farmacia tramite slug e modifica i campi principali.
          </p>
        </div>
      </div>

      {/* Ricerca farmacie */}
      <Card>
        <CardHeader>
          <CardTitle>Ricerca Farmacie</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Cerca per nome, slug, città o indirizzo..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && searchPharmacies()}
                className="pl-10"
              />
            </div>
            <Button onClick={searchPharmacies} disabled={searching || !searchQuery.trim()}>
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </Button>
          </div>
          
          {searchResults.length > 0 && (
            <div className="mt-4 space-y-2 max-h-64 overflow-y-auto border rounded-lg p-2">
              {searchResults.map(pharmacy => (
                <div
                  key={pharmacy.id}
                  className="flex items-center justify-between p-2 hover:bg-slate-50 rounded cursor-pointer border"
                  onClick={() => {
                    setSlug(pharmacy.prontofarmacie_slug)
                    setSearchQuery('')
                    setSearchResults([])
                  }}
                >
                  <div>
                    <p className="font-medium">{pharmacy.name}</p>
                    <p className="text-xs text-muted-foreground">{pharmacy.address || pharmacy.city || pharmacy.prontofarmacie_slug}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={(e) => {
                    e.stopPropagation()
                    setSlug(pharmacy.prontofarmacie_slug)
                    setSearchQuery('')
                    setSearchResults([])
                    loadPharmacy()
                  }}>
                    Carica
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Carica per slug */}
      <div className="flex items-center gap-2">
        <Input placeholder="Inserisci slug farmacia" value={slug} onChange={e => setSlug(e.target.value)} className="w-64" />
        <Button onClick={loadPharmacy} disabled={!slug || loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Carica per slug'}
        </Button>
      </div>

      {pharmacy ? (
        <>
          <div className="flex flex-wrap gap-2">
            {['pharmacy', 'hours', 'description', 'reviews'].map(viewId => (
              <Button
                key={viewId}
                variant={view === viewId ? 'default' : 'outline'}
                onClick={() => setView(viewId)}
              >
                {viewId === 'hours' ? 'orari' : viewId === 'pharmacy' ? 'dati' : viewId === 'description' ? 'descrizione' : viewId}
              </Button>
            ))}
          </div>
          <div>{viewsMap[view]?.()}</div>
        </>
      ) : (
        <Card>
          <CardContent className="p-6 text-muted-foreground">Nessuna farmacia caricata.</CardContent>
        </Card>
      )}
    </section>
  )
}

const Field = ({ label, children, className = '' }) => (
  <div className={`space-y-1 ${className}`}>
    <Label className="text-xs uppercase text-muted-foreground">{label}</Label>
    {children}
  </div>
)
