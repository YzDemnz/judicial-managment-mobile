import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { Session } from '@supabase/supabase-js';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { PORTAL_CONFIRM_URL, PORTAL_URL } from './src/config';
import { supabase } from './src/lib/supabase';

type AuthMode = 'login' | 'signup';
type TabKey =
  | 'inicio'
  | 'despachos'
  | 'expedientes'
  | 'movimientos'
  | 'calendario'
  | 'clientes'
  | 'laboral'
  | 'archivo'
  | 'chat'
  | 'juris'
  | 'cuenta';

interface QuickMetric {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: 'blue' | 'green' | 'gold';
}

const logo = require('./assets/brand-icon.png');

const quickMetrics: QuickMetric[] = [
  { label: 'Despachos', value: 'Beta', icon: 'briefcase-outline', tone: 'blue' },
  { label: 'Alertas', value: '0', icon: 'notifications-outline', tone: 'green' },
  { label: 'Juris', value: 'Activo', icon: 'sparkles-outline', tone: 'gold' },
];

const tabs: Array<{ key: TabKey; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { key: 'inicio', label: 'Inicio', icon: 'home-outline' },
  { key: 'expedientes', label: 'Expedientes', icon: 'folder-open-outline' },
  { key: 'calendario', label: 'Agenda', icon: 'calendar-outline' },
  { key: 'chat', label: 'Chat', icon: 'chatbubble-ellipses-outline' },
  { key: 'cuenta', label: 'Cuenta', icon: 'person-circle-outline' },
];

const matterCards = [
  { title: 'Mercantil', detail: 'Expedientes, juzgados y movimientos.' },
  { title: 'Civil', detail: 'Seguimiento de partes, acuerdos y archivo.' },
  { title: 'Familiar', detail: 'Fechas sensibles y documentos digitales.' },
  { title: 'Laboral', detail: 'Conciliacion, procedimiento ordinario y especial.' },
];

const moduleCards: Array<{
  tab: TabKey;
  title: string;
  detail: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  { tab: 'despachos', title: 'Despachos', detail: 'Crear, unirse y revisar permisos.', icon: 'business-outline' },
  { tab: 'expedientes', title: 'Expedientes', detail: 'Consulta movil por materia.', icon: 'folder-open-outline' },
  { tab: 'movimientos', title: 'Movimientos', detail: 'Acuerdos, audiencias y anexos.', icon: 'document-text-outline' },
  { tab: 'calendario', title: 'Calendario', detail: 'Audiencias y vencimientos.', icon: 'calendar-outline' },
  { tab: 'clientes', title: 'Clientes', detail: 'Datos de contacto del despacho.', icon: 'people-outline' },
  { tab: 'laboral', title: 'Laboral', detail: 'Conciliacion y procedimientos.', icon: 'hammer-outline' },
  { tab: 'archivo', title: 'Archivo', detail: 'Expedientes archivados.', icon: 'archive-outline' },
  { tab: 'juris', title: 'Juris', detail: 'Asistente interno.', icon: 'sparkles-outline' },
];

const moduleDetails: Record<string, { title: string; subtitle: string; bullets: string[]; icon: keyof typeof Ionicons.glyphMap }> = {
  despachos: {
    title: 'Despachos',
    subtitle: 'Vista movil para seleccionar espacios de trabajo y revisar colaboradores.',
    icon: 'business-outline',
    bullets: ['Crear y unirse por codigo diario', 'Ver propietario, admin, editor y solo lectura', 'Preparado para permisos por despacho'],
  },
  movimientos: {
    title: 'Movimientos',
    subtitle: 'Registro ligero de acuerdos, promociones y audiencias desde el telefono.',
    icon: 'document-text-outline',
    bullets: ['Adjuntar fotos o documentos en fase siguiente', 'Detectar audiencias para calendario', 'Alertas por movimiento nuevo'],
  },
  clientes: {
    title: 'Clientes',
    subtitle: 'Directorio movil para consultar datos importantes del cliente.',
    icon: 'people-outline',
    bullets: ['Buscar por nombre o telefono', 'Abrir contacto desde celular', 'Relacionar clientes con expedientes'],
  },
  laboral: {
    title: 'Laboral',
    subtitle: 'Acceso directo a conciliacion, junta local y tribunal laboral.',
    icon: 'hammer-outline',
    bullets: ['Conciliacion sin numero de expediente', 'Procedimiento ordinario y especial', 'Hoja y fecha de conciliacion'],
  },
  archivo: {
    title: 'Archivo',
    subtitle: 'Consulta de expedientes archivados sin saturar la vista activa.',
    icon: 'archive-outline',
    bullets: ['Filtrar por fecha de ingreso', 'Filtrar por ultima modificacion', 'Preparado para recuperar expediente'],
  },
};

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('inicio');
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoadingSession(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoadingSession(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const displayEmail = useMemo(() => session?.user.email ?? 'Cuenta beta', [session?.user.email]);

  const handleAuth = async () => {
    setError('');
    setMessage('');
    setAuthLoading(true);

    try {
      const cleanEmail = email.trim().toLowerCase();
      if (!cleanEmail || password.length < 6) {
        throw new Error('Escribe un correo valido y una contrasena de minimo 6 caracteres.');
      }

      if (mode === 'signup') {
        const { error: signUpError } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            emailRedirectTo: PORTAL_CONFIRM_URL,
            data: { signup_source: 'judicial_mobile_beta' },
          },
        });

        if (signUpError) throw signUpError;

        setMessage('Te enviamos un correo de verificacion. Confirma tu cuenta y vuelve a iniciar sesion.');
        setMode('login');
        setPassword('');
        return;
      }

      const { error: loginError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (loginError) throw loginError;
      setPassword('');
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'No se pudo completar el acceso.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setActiveTab('inicio');
  };

  if (loadingSession) {
    return (
      <LinearGradient colors={['#0f172a', '#16233a', '#233a61']} style={styles.loadingScreen}>
        <Image source={logo} style={styles.loadingLogo} />
        <ActivityIndicator color="#d8c27d" size="large" />
        <Text style={styles.loadingText}>Preparando Judicial Managment</Text>
        <StatusBar style="light" />
      </LinearGradient>
    );
  }

  if (!session) {
    return (
      <LinearGradient colors={['#0f172a', '#17243b', '#1f365b']} style={styles.screen}>
        <StatusBar style="light" />
        <SafeAreaView style={styles.safeArea}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboardArea}>
            <ScrollView contentContainerStyle={styles.authContent} keyboardShouldPersistTaps="handled">
              <View style={styles.brandBlock}>
                <Image source={logo} style={styles.logo} />
                <Text style={styles.brandKicker}>MR Legal</Text>
                <Text style={styles.heroTitle}>Judicial Managment</Text>
                <Text style={styles.heroText}>
                  Version movil para revisar tu despacho, recibir avisos y trabajar fuera de la computadora.
                </Text>
              </View>

              <View style={styles.authCard}>
                <View style={styles.authModeRow}>
                  <Pressable
                    style={[styles.modeButton, mode === 'login' && styles.modeButtonActive]}
                    onPress={() => setMode('login')}
                  >
                    <Text style={[styles.modeButtonText, mode === 'login' && styles.modeButtonTextActive]}>
                      Iniciar sesion
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[styles.modeButton, mode === 'signup' && styles.modeButtonActive]}
                    onPress={() => setMode('signup')}
                  >
                    <Text style={[styles.modeButtonText, mode === 'signup' && styles.modeButtonTextActive]}>
                      Crear cuenta
                    </Text>
                  </Pressable>
                </View>

                {Boolean(error) && <Text style={styles.errorBox}>{error}</Text>}
                {Boolean(message) && <Text style={styles.successBox}>{message}</Text>}

                <TextInput
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  onChangeText={setEmail}
                  placeholder="correo@despacho.com"
                  placeholderTextColor="#7b8798"
                  style={styles.input}
                  value={email}
                />
                <TextInput
                  autoCapitalize="none"
                  onChangeText={setPassword}
                  placeholder="Contrasena"
                  placeholderTextColor="#7b8798"
                  secureTextEntry
                  style={styles.input}
                  value={password}
                />

                <Pressable style={styles.primaryButton} onPress={handleAuth} disabled={authLoading}>
                  {authLoading ? (
                    <ActivityIndicator color="#111827" />
                  ) : (
                    <>
                      <Ionicons name={mode === 'login' ? 'log-in-outline' : 'person-add-outline'} size={20} color="#111827" />
                      <Text style={styles.primaryButtonText}>{mode === 'login' ? 'Entrar' : 'Crear cuenta beta'}</Text>
                    </>
                  )}
                </Pressable>

                <Pressable style={styles.portalLink} onPress={() => Linking.openURL(PORTAL_URL)}>
                  <Ionicons name="open-outline" size={17} color="#d8c27d" />
                  <Text style={styles.portalLinkText}>Abrir portal web</Text>
                </Pressable>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <View style={styles.appShell}>
      <StatusBar style="light" />
      <LinearGradient colors={['#111827', '#17243a']} style={styles.appHeader}>
        <SafeAreaView>
          <View style={styles.headerRow}>
            <Image source={logo} style={styles.headerLogo} />
            <View style={styles.headerText}>
              <Text style={styles.headerKicker}>Beta movil</Text>
              <Text style={styles.headerTitle}>Judicial Managment</Text>
              <Text style={styles.headerEmail}>{displayEmail}</Text>
            </View>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
        {activeTab === 'inicio' && <HomeScreen email={displayEmail} onOpenModule={setActiveTab} />}
        {activeTab === 'expedientes' && <ExpedientesScreen />}
        {activeTab === 'despachos' && <ModuleScreen detail={moduleDetails.despachos} onBack={() => setActiveTab('inicio')} />}
        {activeTab === 'movimientos' && <ModuleScreen detail={moduleDetails.movimientos} onBack={() => setActiveTab('inicio')} />}
        {activeTab === 'calendario' && <CalendarScreen />}
        {activeTab === 'clientes' && <ModuleScreen detail={moduleDetails.clientes} onBack={() => setActiveTab('inicio')} />}
        {activeTab === 'laboral' && <ModuleScreen detail={moduleDetails.laboral} onBack={() => setActiveTab('inicio')} />}
        {activeTab === 'archivo' && <ModuleScreen detail={moduleDetails.archivo} onBack={() => setActiveTab('inicio')} />}
        {activeTab === 'chat' && <ChatScreen />}
        {activeTab === 'juris' && <JurisScreen />}
        {activeTab === 'cuenta' && <AccountScreen email={displayEmail} onSignOut={handleSignOut} />}
      </ScrollView>

      <View style={styles.tabBar}>
        {tabs.map((tab) => {
          const active = tab.key === activeTab;
          return (
            <Pressable key={tab.key} style={styles.tabButton} onPress={() => setActiveTab(tab.key)}>
              <Ionicons name={tab.icon} size={21} color={active ? '#d8c27d' : '#8996aa'} />
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function HomeScreen({ email, onOpenModule }: { email: string; onOpenModule: (tab: TabKey) => void }) {
  return (
    <View style={styles.stack}>
      <View style={styles.sectionIntro}>
        <Text style={styles.sectionKicker}>Panel movil</Text>
        <Text style={styles.sectionTitle}>Hola, {email.split('@')[0]}</Text>
        <Text style={styles.sectionText}>
          Esta primera version queda lista para iniciar sesion y preparar los modulos moviles del despacho.
        </Text>
      </View>

      <View style={styles.metricGrid}>
        {quickMetrics.map((metric) => (
          <View key={metric.label} style={[styles.metricCard, styles[`metricCard_${metric.tone}`]]}>
            <Ionicons name={metric.icon} size={22} color="#ffffff" />
            <Text style={styles.metricValue}>{metric.value}</Text>
            <Text style={styles.metricLabel}>{metric.label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.moduleGrid}>
        {moduleCards.map((module) => (
          <Pressable key={module.title} style={styles.moduleCard} onPress={() => onOpenModule(module.tab)}>
            <View style={styles.moduleIcon}>
              <Ionicons name={module.icon} size={22} color="#d8c27d" />
            </View>
            <Text style={styles.moduleTitle}>{module.title}</Text>
            <Text style={styles.moduleText}>{module.detail}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.actionCard}>
        <View style={styles.actionIcon}>
          <Ionicons name="camera-outline" size={24} color="#d8c27d" />
        </View>
        <View style={styles.actionCopy}>
          <Text style={styles.cardTitle}>Siguiente fase: documentos desde celular</Text>
          <Text style={styles.cardText}>
            Subir fotos, PDF y Word a expedientes y movimientos desde el telefono.
          </Text>
        </View>
      </View>

      <View style={styles.actionCard}>
        <View style={styles.actionIcon}>
          <Ionicons name="notifications-outline" size={24} color="#d8c27d" />
        </View>
        <View style={styles.actionCopy}>
          <Text style={styles.cardTitle}>Recordatorios de audiencia</Text>
          <Text style={styles.cardText}>
            Preparado para convertir eventos del calendario en notificaciones moviles.
          </Text>
        </View>
      </View>
    </View>
  );
}

function ExpedientesScreen() {
  return (
    <View style={styles.stack}>
      <View style={styles.sectionIntro}>
        <Text style={styles.sectionKicker}>Expedientes</Text>
        <Text style={styles.sectionTitle}>Consulta rapida por materia</Text>
        <Text style={styles.sectionText}>
          La app movil funcionara como vista ligera para revisar expedientes y subir documentos urgentes.
        </Text>
      </View>

      {matterCards.map((matter) => (
        <View key={matter.title} style={styles.listCard}>
          <View>
            <Text style={styles.cardTitle}>{matter.title}</Text>
            <Text style={styles.cardText}>{matter.detail}</Text>
          </View>
          <Ionicons name="chevron-forward" size={21} color="#d8c27d" />
        </View>
      ))}
    </View>
  );
}

function CalendarScreen() {
  return (
    <View style={styles.stack}>
      <View style={styles.sectionIntro}>
        <Text style={styles.sectionKicker}>Agenda</Text>
        <Text style={styles.sectionTitle}>Audiencias y vencimientos</Text>
        <Text style={styles.sectionText}>
          Aqui concentraremos fechas detectadas desde movimientos y avisos programados.
        </Text>
      </View>

      <View style={styles.timelineCard}>
        <Text style={styles.timelineDate}>Hoy</Text>
        <Text style={styles.cardTitle}>Sin eventos cargados en movil</Text>
        <Text style={styles.cardText}>
          Cuando conectemos el calendario de la app de escritorio, apareceran audiencias y recordatorios.
        </Text>
      </View>
    </View>
  );
}

function ChatScreen() {
  return (
    <View style={styles.stack}>
      <View style={styles.sectionIntro}>
        <Text style={styles.sectionKicker}>Chat y Juris</Text>
        <Text style={styles.sectionTitle}>Comunicacion del despacho</Text>
        <Text style={styles.sectionText}>
          Esta pantalla sera el puente para chat, archivos rapidos y el asistente Juris.
        </Text>
      </View>

      <View style={styles.botCard}>
        <View style={styles.botFace}>
          <Ionicons name="hardware-chip-outline" size={34} color="#ffffff" />
        </View>
        <Text style={styles.cardTitle}>Juris movil</Text>
        <Text style={styles.cardText}>
          En la siguiente etapa respondera dudas de uso y guiara a expedientes, calendario y archivos.
        </Text>
      </View>

      <View style={styles.chatPreviewCard}>
        <Text style={styles.chatBubbleOther}>Juris: puedo ayudarte a encontrar expedientes, subir documentos o registrar audiencias.</Text>
        <Text style={styles.chatBubbleMine}>Necesito revisar una audiencia.</Text>
        <Text style={styles.chatHint}>El chat real se conectara al despacho seleccionado.</Text>
      </View>
    </View>
  );
}

function JurisScreen() {
  return (
    <View style={styles.stack}>
      <View style={styles.sectionIntro}>
        <Text style={styles.sectionKicker}>Juris</Text>
        <Text style={styles.sectionTitle}>Asistente movil</Text>
        <Text style={styles.sectionText}>
          Juris queda separado para consultas rapidas y guias de uso sin saturar el chat del despacho.
        </Text>
      </View>

      <View style={styles.listCard}>
        <View>
          <Text style={styles.cardTitle}>Atajos preparados</Text>
          <Text style={styles.cardText}>Crear expediente, registrar audiencia, subir documentos y archivar.</Text>
        </View>
        <Ionicons name="sparkles-outline" size={22} color="#d8c27d" />
      </View>
    </View>
  );
}

function ModuleScreen({
  detail,
  onBack,
}: {
  detail: { title: string; subtitle: string; bullets: string[]; icon: keyof typeof Ionicons.glyphMap };
  onBack: () => void;
}) {
  return (
    <View style={styles.stack}>
      <Pressable style={styles.backButton} onPress={onBack}>
        <Ionicons name="arrow-back" size={18} color="#315a86" />
        <Text style={styles.backButtonText}>Volver al inicio</Text>
      </Pressable>

      <View style={styles.sectionIntro}>
        <View style={styles.moduleHeroIcon}>
          <Ionicons name={detail.icon} size={28} color="#d8c27d" />
        </View>
        <Text style={styles.sectionKicker}>Modulo beta</Text>
        <Text style={styles.sectionTitle}>{detail.title}</Text>
        <Text style={styles.sectionText}>{detail.subtitle}</Text>
      </View>

      {detail.bullets.map((bullet) => (
        <View key={bullet} style={styles.checkRow}>
          <Ionicons name="checkmark-circle-outline" size={20} color="#2f795d" />
          <Text style={styles.checkText}>{bullet}</Text>
        </View>
      ))}
    </View>
  );
}

function AccountScreen({ email, onSignOut }: { email: string; onSignOut: () => Promise<void> }) {
  return (
    <View style={styles.stack}>
      <View style={styles.sectionIntro}>
        <Text style={styles.sectionKicker}>Cuenta</Text>
        <Text style={styles.sectionTitle}>Sesion activa</Text>
        <Text style={styles.sectionText}>{email}</Text>
      </View>

      <Pressable style={styles.secondaryButton} onPress={() => Linking.openURL(PORTAL_URL)}>
        <Ionicons name="globe-outline" size={20} color="#d8c27d" />
        <Text style={styles.secondaryButtonText}>Abrir portal web</Text>
      </Pressable>

      <Pressable style={styles.dangerButton} onPress={onSignOut}>
        <Ionicons name="log-out-outline" size={20} color="#ffffff" />
        <Text style={styles.dangerButtonText}>Cerrar sesion</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  keyboardArea: {
    flex: 1,
  },
  authContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 22,
  },
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingLogo: {
    width: 88,
    height: 88,
  },
  loadingText: {
    color: '#e5edf8',
    fontSize: 15,
    fontWeight: '700',
  },
  brandBlock: {
    alignItems: 'center',
    marginBottom: 26,
  },
  logo: {
    width: 104,
    height: 104,
    marginBottom: 14,
  },
  brandKicker: {
    color: '#d8c27d',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  heroTitle: {
    marginTop: 8,
    color: '#ffffff',
    fontSize: 38,
    fontWeight: '900',
    lineHeight: 42,
    textAlign: 'center',
  },
  heroText: {
    marginTop: 12,
    color: '#d7e2f2',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  authCard: {
    borderWidth: 1,
    borderColor: 'rgba(209, 218, 232, 0.22)',
    borderRadius: 20,
    padding: 16,
    backgroundColor: 'rgba(17, 24, 39, 0.72)',
  },
  authModeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  modeButton: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  modeButtonActive: {
    backgroundColor: '#d8c27d',
  },
  modeButtonText: {
    color: '#dce6f4',
    fontWeight: '800',
  },
  modeButtonTextActive: {
    color: '#111827',
  },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: 'rgba(209, 218, 232, 0.24)',
    borderRadius: 14,
    marginBottom: 10,
    paddingHorizontal: 14,
    backgroundColor: '#f8fafc',
    color: '#111827',
    fontSize: 16,
  },
  primaryButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    borderRadius: 14,
    marginTop: 4,
    backgroundColor: '#d8c27d',
  },
  primaryButtonText: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '900',
  },
  portalLink: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  portalLinkText: {
    color: '#d8c27d',
    fontWeight: '800',
  },
  errorBox: {
    borderRadius: 12,
    marginBottom: 10,
    padding: 11,
    overflow: 'hidden',
    backgroundColor: 'rgba(127, 29, 29, 0.42)',
    color: '#fecaca',
    lineHeight: 19,
  },
  successBox: {
    borderRadius: 12,
    marginBottom: 10,
    padding: 11,
    overflow: 'hidden',
    backgroundColor: 'rgba(12, 74, 110, 0.48)',
    color: '#d8f3ff',
    lineHeight: 19,
  },
  appShell: {
    flex: 1,
    backgroundColor: '#eef2f7',
  },
  appHeader: {
    paddingBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: Platform.OS === 'android' ? 34 : 8,
  },
  headerLogo: {
    width: 54,
    height: 54,
  },
  headerText: {
    flex: 1,
  },
  headerKicker: {
    color: '#d8c27d',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '900',
  },
  headerEmail: {
    color: '#c8d4e6',
    fontSize: 12,
  },
  content: {
    flex: 1,
  },
  contentInner: {
    padding: 18,
    paddingBottom: 106,
  },
  stack: {
    gap: 14,
  },
  sectionIntro: {
    borderRadius: 18,
    padding: 18,
    backgroundColor: '#ffffff',
  },
  sectionKicker: {
    color: '#315a86',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  sectionTitle: {
    marginTop: 7,
    color: '#111827',
    fontSize: 26,
    fontWeight: '900',
    lineHeight: 31,
  },
  sectionText: {
    marginTop: 8,
    color: '#5b6675',
    fontSize: 14,
    lineHeight: 21,
  },
  metricGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  metricCard: {
    flex: 1,
    minHeight: 118,
    borderRadius: 18,
    padding: 13,
    justifyContent: 'space-between',
  },
  metricCard_blue: {
    backgroundColor: '#315a86',
  },
  metricCard_green: {
    backgroundColor: '#2f795d',
  },
  metricCard_gold: {
    backgroundColor: '#8a6c22',
  },
  metricValue: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '900',
  },
  metricLabel: {
    color: 'rgba(255,255,255,0.84)',
    fontSize: 12,
    fontWeight: '800',
  },
  actionCard: {
    flexDirection: 'row',
    gap: 14,
    borderRadius: 18,
    padding: 16,
    backgroundColor: '#17243a',
  },
  actionIcon: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: 'rgba(216, 194, 125, 0.12)',
  },
  actionCopy: {
    flex: 1,
  },
  moduleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  moduleCard: {
    width: '48.5%',
    minHeight: 142,
    borderRadius: 18,
    padding: 14,
    backgroundColor: '#ffffff',
  },
  moduleIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    marginBottom: 12,
    backgroundColor: '#17243a',
  },
  moduleTitle: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '900',
  },
  moduleText: {
    marginTop: 5,
    color: '#647184',
    fontSize: 12,
    lineHeight: 17,
  },
  moduleHeroIcon: {
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    marginBottom: 12,
    backgroundColor: '#17243a',
  },
  backButton: {
    width: '100%',
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    borderRadius: 13,
    backgroundColor: '#ffffff',
  },
  backButtonText: {
    color: '#315a86',
    fontWeight: '900',
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 16,
    padding: 14,
    backgroundColor: '#ffffff',
  },
  checkText: {
    flex: 1,
    color: '#334155',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  cardTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '900',
  },
  cardText: {
    marginTop: 5,
    color: '#647184',
    fontSize: 13,
    lineHeight: 19,
  },
  listCard: {
    minHeight: 86,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    borderRadius: 16,
    padding: 16,
    backgroundColor: '#ffffff',
  },
  timelineCard: {
    borderRadius: 18,
    padding: 18,
    backgroundColor: '#ffffff',
  },
  timelineDate: {
    color: '#315a86',
    fontSize: 13,
    fontWeight: '900',
    marginBottom: 10,
  },
  botCard: {
    alignItems: 'center',
    borderRadius: 20,
    padding: 22,
    backgroundColor: '#ffffff',
  },
  botFace: {
    width: 82,
    height: 82,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 28,
    marginBottom: 14,
    backgroundColor: '#315a86',
  },
  chatPreviewCard: {
    gap: 10,
    borderRadius: 18,
    padding: 16,
    backgroundColor: '#ffffff',
  },
  chatBubbleOther: {
    alignSelf: 'flex-start',
    maxWidth: '86%',
    borderRadius: 14,
    padding: 12,
    overflow: 'hidden',
    backgroundColor: '#e8eef7',
    color: '#243246',
    lineHeight: 19,
  },
  chatBubbleMine: {
    alignSelf: 'flex-end',
    maxWidth: '78%',
    borderRadius: 14,
    padding: 12,
    overflow: 'hidden',
    backgroundColor: '#315a86',
    color: '#ffffff',
    lineHeight: 19,
  },
  chatHint: {
    color: '#647184',
    fontSize: 12,
    textAlign: 'center',
  },
  secondaryButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    borderRadius: 14,
    backgroundColor: '#17243a',
  },
  secondaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
  },
  dangerButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    borderRadius: 14,
    backgroundColor: '#9f1239',
  },
  dangerButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
  },
  tabBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#d7dee9',
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 26 : 12,
    paddingHorizontal: 8,
    backgroundColor: '#ffffff',
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  tabLabel: {
    color: '#8996aa',
    fontSize: 11,
    fontWeight: '800',
  },
  tabLabelActive: {
    color: '#315a86',
  },
});
