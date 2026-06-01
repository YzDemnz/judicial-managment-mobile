import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
type Section =
  | 'dashboard'
  | 'totalExpedientes'
  | 'expedientes'
  | 'archivo'
  | 'movimientos'
  | 'calendario'
  | 'clientes'
  | 'laboral'
  | 'teamChat'
  | 'juris'
  | 'configuracion';

type Tone = 'blue' | 'green' | 'orange' | 'cyan' | 'slate' | 'indigo';

interface StatCard {
  title: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: Tone;
  target: Section;
}

interface ReportItem {
  type: 'movimiento' | 'expediente' | 'cliente';
  label: string;
  detail: string;
}

interface ProfileSettings {
  displayName: string;
  roleLabel: string;
  profileInitial: string;
  accentColor: string;
}

const logo = require('./assets/brand-icon.png');
const PROFILE_STORAGE_KEY = 'judicial-mobile-profile-settings';
const JURIS_PREMIUM_UNLOCKED = false;

const navigation: Array<{ id: Section; name: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { id: 'dashboard', name: 'Panel de Control', icon: 'grid-outline' },
  { id: 'expedientes', name: 'Expedientes', icon: 'document-text-outline' },
  { id: 'movimientos', name: 'Movimientos', icon: 'document-attach-outline' },
  { id: 'calendario', name: 'Calendario', icon: 'calendar-outline' },
  { id: 'clientes', name: 'Clientes', icon: 'people-outline' },
  { id: 'laboral', name: 'Laboral', icon: 'business-outline' },
  { id: 'configuracion', name: 'Configuracion', icon: 'settings-outline' },
];

const quickLinks = [
  { label: 'PJF', name: 'Poder Judicial de la Federacion', url: 'https://www.pjf.gob.mx/' },
  { label: 'Poder en Linea', name: 'Poder Judicial de Coahuila', url: 'https://poderenlinea.gob.mx/' },
  { label: 'SCJN', name: 'Suprema Corte de Justicia de la Nacion', url: 'https://www.scjn.gob.mx/' },
];

const statCards: StatCard[] = [
  { title: 'Total Expedientes', value: '0', icon: 'document-text-outline', tone: 'blue', target: 'totalExpedientes' },
  { title: 'Expedientes Activos', value: '0', icon: 'trending-up-outline', tone: 'green', target: 'expedientes' },
  { title: 'Clientes', value: '0', icon: 'people-outline', tone: 'orange', target: 'clientes' },
  { title: 'Movimientos', value: '0', icon: 'document-attach-outline', tone: 'cyan', target: 'movimientos' },
  { title: 'Asuntos Laborales', value: '0', icon: 'business-outline', tone: 'slate', target: 'laboral' },
  { title: 'Archivo', value: '0', icon: 'archive-outline', tone: 'indigo', target: 'archivo' },
];

const reportItems: ReportItem[] = [
  { type: 'movimiento', label: 'Movimiento agregado', detail: 'Audiencia registrada para seguimiento.' },
  { type: 'expediente', label: 'Expediente agregado', detail: 'Nuevo expediente visible en el despacho.' },
  { type: 'cliente', label: 'Cliente agregado', detail: 'Nuevo contacto disponible para el equipo.' },
];

const expedienteGroups = [
  { title: 'Mercantil', detail: 'Juzgados mercantiles, ordinario, ejecutivo y oral.' },
  { title: 'Civil', detail: 'Juzgados civiles, promociones, acuerdos y archivo.' },
  { title: 'Familiar', detail: 'Fechas sensibles, partes y documentos digitales.' },
  { title: 'Letrado', detail: 'Consulta compacta por juzgado y fecha de ingreso.' },
  { title: 'Penal', detail: 'Control de asuntos, audiencias y documentos.' },
];

const laboralGroups = [
  { title: 'Conciliacion', detail: 'Nombre de partes, fecha y hoja de conciliacion.' },
  { title: 'Junta Local de Conciliacion y Arbitraje', detail: 'Expedientes laborales previos al nuevo sistema.' },
  { title: 'Tribunal Laboral', detail: 'Procedimiento ordinario, especial y audiencias.' },
];

const profileColors = ['#1d4ed8', '#0f766e', '#7c3aed', '#be123c', '#ca8a04'];

const defaultProfileSettings: ProfileSettings = {
  displayName: '',
  roleLabel: 'Colaborador',
  profileInitial: 'L',
  accentColor: profileColors[0],
};

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [activeSection, setActiveSection] = useState<Section>('dashboard');
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [profileSettings, setProfileSettings] = useState<ProfileSettings>(defaultProfileSettings);

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

  useEffect(() => {
    let mounted = true;

    AsyncStorage.getItem(PROFILE_STORAGE_KEY)
      .then((savedProfile) => {
        if (!mounted || !savedProfile) return;
        const parsedProfile = JSON.parse(savedProfile) as Partial<ProfileSettings>;
        setProfileSettings({ ...defaultProfileSettings, ...parsedProfile });
      })
      .catch(() => undefined);

    return () => {
      mounted = false;
    };
  }, []);

  const updateProfileSettings = (nextSettings: ProfileSettings) => {
    setProfileSettings(nextSettings);
    AsyncStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(nextSettings)).catch(() => undefined);
  };

  const displayEmail = useMemo(() => session?.user.email ?? 'Cuenta beta', [session?.user.email]);
  const displayName = profileSettings.displayName.trim() || displayEmail.split('@')[0] || 'Colaborador';

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
    setActiveSection('dashboard');
  };

  if (loadingSession) {
    return (
      <LinearGradient colors={['#020617', '#0f172a']} style={styles.loadingScreen}>
        <Image source={logo} style={styles.loadingLogo} />
        <ActivityIndicator color="#ffffff" size="large" />
        <Text style={styles.loadingText}>Preparando Judicial Managment</Text>
        <StatusBar style="light" />
      </LinearGradient>
    );
  }

  if (!session) {
    return (
      <LinearGradient colors={['#020617', '#0f172a']} style={styles.screen}>
        <StatusBar style="light" />
        <SafeAreaView style={styles.safeArea}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboardArea}>
            <ScrollView contentContainerStyle={styles.authContent} keyboardShouldPersistTaps="handled">
              <View style={styles.authShell}>
                <View style={styles.authHeader}>
                  <Image source={logo} style={styles.authLogo} />
                  <Text style={styles.authTitle}>Judicial Managment</Text>
                  <Text style={styles.authSubtitle}>Gestion juridica profesional</Text>
                </View>

                <View style={styles.authCard}>
                  <Text style={styles.authCardTitle}>{mode === 'login' ? 'Iniciar Sesion' : 'Crear Cuenta'}</Text>

                  {Boolean(error) && <Text style={styles.errorBox}>{error}</Text>}
                  {Boolean(message) && <Text style={styles.successBox}>{message}</Text>}

                  <Text style={styles.inputLabel}>Correo Electronico</Text>
                  <TextInput
                    autoCapitalize="none"
                    autoComplete="email"
                    keyboardType="email-address"
                    onChangeText={setEmail}
                    placeholder="correo@despacho.com"
                    placeholderTextColor="#94a3b8"
                    style={styles.input}
                    value={email}
                  />

                  <Text style={styles.inputLabel}>Contrasena</Text>
                  <TextInput
                    autoCapitalize="none"
                    onChangeText={setPassword}
                    placeholder="Minimo 6 caracteres"
                    placeholderTextColor="#94a3b8"
                    secureTextEntry
                    style={styles.input}
                    value={password}
                  />

                  <Pressable style={styles.primaryButton} onPress={handleAuth} disabled={authLoading}>
                    {authLoading ? (
                      <ActivityIndicator color="#ffffff" />
                    ) : (
                      <Text style={styles.primaryButtonText}>
                        {mode === 'login' ? 'Iniciar Sesion' : 'Crear una cuenta'}
                      </Text>
                    )}
                  </Pressable>

                  <View style={styles.authDivider} />

                  <Pressable
                    style={styles.secondaryButton}
                    onPress={() => {
                      setError('');
                      setMessage('');
                      setMode(mode === 'login' ? 'signup' : 'login');
                    }}
                  >
                    <Text style={styles.secondaryButtonText}>
                      {mode === 'login' ? 'Crear una cuenta' : 'Ya tengo cuenta'}
                    </Text>
                  </Pressable>

                  <Pressable style={styles.portalLink} onPress={() => Linking.openURL(PORTAL_URL)}>
                    <Text style={styles.portalLinkText}>Abrir portal web</Text>
                    <Ionicons name="open-outline" size={16} color="#1d4ed8" />
                  </Pressable>
                </View>
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
      <LinearGradient colors={['#020617', '#0f172a']} style={styles.appHeader}>
        <SafeAreaView>
          <View style={styles.headerRow}>
            <Image source={logo} style={styles.headerLogo} />
            <View style={styles.headerText}>
              <Text style={styles.headerTitle}>Judicial Managment</Text>
              <Text style={styles.headerSubtitle}>{displayName}</Text>
            </View>
            <View style={[styles.headerAvatar, { backgroundColor: profileSettings.accentColor }]}>
              <Text style={styles.headerAvatarText}>{profileSettings.profileInitial.slice(0, 1).toUpperCase()}</Text>
            </View>
            <Pressable style={styles.headerIconButton} onPress={handleSignOut}>
              <Ionicons name="log-out-outline" size={19} color="#dbeafe" />
            </Pressable>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.navScroll}
          >
            {navigation.map((item) => {
              const active = item.id === activeSection;
              return (
                <Pressable
                  key={item.id}
                  style={[styles.navItem, active && styles.navItemActive]}
                  onPress={() => setActiveSection(item.id)}
                >
                  <Ionicons name={item.icon} size={18} color={active ? '#1d4ed8' : '#475569'} />
                  <Text style={[styles.navText, active && styles.navTextActive]}>{item.name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
        {activeSection === 'dashboard' && <DashboardScreen onNavigate={setActiveSection} />}
        {activeSection === 'totalExpedientes' && <TotalExpedientesScreen onNavigate={setActiveSection} />}
        {activeSection === 'expedientes' && <ExpedientesScreen />}
        {activeSection === 'archivo' && <ArchivoScreen onNavigate={setActiveSection} />}
        {activeSection === 'movimientos' && <MovimientosScreen />}
        {activeSection === 'calendario' && <CalendarioScreen />}
        {activeSection === 'clientes' && <ClientesScreen />}
        {activeSection === 'laboral' && <LaboralScreen />}
        {activeSection === 'teamChat' && <TeamChatScreen />}
        {activeSection === 'juris' && JURIS_PREMIUM_UNLOCKED && <JurisPremiumScreen onNavigate={setActiveSection} />}
        {activeSection === 'juris' && !JURIS_PREMIUM_UNLOCKED && <DashboardScreen onNavigate={setActiveSection} />}
        {activeSection === 'configuracion' && (
          <ConfiguracionScreen
            email={displayEmail}
            profileSettings={profileSettings}
            onProfileSettingsChange={updateProfileSettings}
            onNavigate={setActiveSection}
            onSignOut={handleSignOut}
          />
        )}
      </ScrollView>
    </View>
  );
}

function DashboardScreen({ onNavigate }: { onNavigate: (section: Section) => void }) {
  return (
    <View style={styles.stack}>
      <View style={styles.titleRow}>
        <View style={styles.titleCopy}>
          <Text style={styles.screenTitle}>Panel de Control</Text>
          <Text style={styles.screenSubtitle}>Resumen general de gestion juridica</Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickLinksRow}>
        {quickLinks.map((link) => (
          <Pressable key={link.label} style={styles.quickLink} onPress={() => Linking.openURL(link.url)}>
            <Text style={styles.quickLinkText}>{link.label}</Text>
            <Ionicons name="open-outline" size={15} color="#1d4ed8" />
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.statGrid}>
        {statCards.map((card) => (
          <Pressable
            key={card.title}
            style={[styles.statCard, styles[`statCard_${card.tone}`]]}
            onPress={() => onNavigate(card.target)}
          >
            <View>
              <Text style={[styles.statLabel, styles[`statText_${card.tone}`]]}>{card.title}</Text>
              <Text style={[styles.statValue, styles[`statText_${card.tone}`]]}>{card.value}</Text>
            </View>
            <View style={styles.statIcon}>
              <Ionicons name={card.icon} size={28} color="#1d4ed8" />
            </View>
          </Pressable>
        ))}
      </View>

      <Pressable style={styles.teamCard} onPress={() => onNavigate('teamChat')}>
        <TeamChatIcon />
        <View style={styles.teamCopy}>
          <Text style={styles.kicker}>Colaboracion</Text>
          <Text style={styles.cardTitle}>Chat de equipo</Text>
          <Text style={styles.cardText}>Mensajes, archivos y avisos internos entre colaboradores del despacho.</Text>
        </View>
        <Ionicons name="chatbubble-ellipses-outline" size={21} color="#ffffff" />
      </Pressable>

      <View style={styles.reportCard}>
        <View style={styles.reportHeader}>
          <View>
            <Text style={styles.cardTitle}>Chat de reportes</Text>
            <Text style={styles.cardText}>Alertas recientes del despacho</Text>
          </View>
          <Text style={styles.reportCount}>{reportItems.length} reporte(s)</Text>
        </View>

        <View style={styles.reportList}>
          {reportItems.map((item) => (
            <View key={item.label} style={[styles.reportItem, styles[`report_${item.type}`]]}>
              <Text style={styles.reportLabel}>{item.label}</Text>
              <Text style={styles.reportDetail}>{item.detail}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function TotalExpedientesScreen({ onNavigate }: { onNavigate: (section: Section) => void }) {
  return (
    <View style={styles.stack}>
      <ScreenHeader
        title="Total Expedientes"
        subtitle="Directorio completo ordenado por fecha de ingreso y ultima modificacion."
      />
      <CompactList
        items={[
          'Fecha de ingreso mas reciente',
          'Ultima modificacion',
          'Materia y juzgado',
          'Estatus activo o archivado',
        ]}
      />
      <Pressable style={styles.primaryAction} onPress={() => onNavigate('expedientes')}>
        <Text style={styles.primaryActionText}>Abrir Expedientes</Text>
        <Ionicons name="arrow-forward" size={18} color="#ffffff" />
      </Pressable>
    </View>
  );
}

function ExpedientesScreen() {
  return (
    <View style={styles.stack}>
      <ScreenHeader
        title="Expedientes"
        subtitle="Primero eliges materia, luego juzgado, y dentro agregas o consultas expedientes."
      />
      {expedienteGroups.map((group) => (
        <CompactRow key={group.title} title={group.title} detail={group.detail} icon="folder-open-outline" />
      ))}
      <View style={styles.formPreview}>
        <Text style={styles.cardTitle}>Nuevo expediente</Text>
        <Text style={styles.cardText}>Materia, juzgado, partes, numero, estatus y archivos adjuntos.</Text>
      </View>
    </View>
  );
}

function ArchivoScreen({ onNavigate }: { onNavigate: (section: Section) => void }) {
  return (
    <View style={styles.stack}>
      <ScreenHeader title="Archivo" subtitle="Expedientes archivados separados de los activos." />
      <CompactList items={['Archivado por fecha', 'Busqueda por partes', 'Recuperacion desde expedientes']} />
      <Pressable style={styles.secondaryAction} onPress={() => onNavigate('expedientes')}>
        <Text style={styles.secondaryActionText}>Volver a Expedientes</Text>
      </Pressable>
    </View>
  );
}

function MovimientosScreen() {
  return (
    <View style={styles.stack}>
      <ScreenHeader title="Movimientos" subtitle="Acuerdos, promociones, audiencias y archivos relacionados." />
      <View style={styles.formPreview}>
        <Text style={styles.inputLabel}>Tipo de movimiento</Text>
        <View style={styles.selectLike}>
          <Text style={styles.selectLikeText}>Audiencia</Text>
          <Ionicons name="chevron-down" size={17} color="#64748b" />
        </View>
        <Text style={styles.inputLabel}>Fecha de audiencia</Text>
        <View style={styles.selectLike}>
          <Text style={styles.placeholderText}>00/00/0000</Text>
          <Ionicons name="calendar-outline" size={17} color="#64748b" />
        </View>
      </View>
      <CompactList items={['Alerta roja por movimiento nuevo', 'Adjuntar PDF, Word o imagen', 'Enviar fecha al calendario']} />
    </View>
  );
}

function CalendarioScreen() {
  return (
    <View style={styles.stack}>
      <ScreenHeader title="Calendario" subtitle="Audiencias y vencimientos detectados desde movimientos." />
      <View style={styles.calendarBox}>
        <View style={styles.calendarDate}>
          <Text style={styles.calendarDay}>Hoy</Text>
          <Text style={styles.calendarNumber}>31</Text>
        </View>
        <View style={styles.calendarCopy}>
          <Text style={styles.cardTitle}>Sin eventos cargados</Text>
          <Text style={styles.cardText}>Las audiencias apareceran aqui al registrar fecha en movimientos.</Text>
        </View>
      </View>
    </View>
  );
}

function ClientesScreen() {
  return (
    <View style={styles.stack}>
      <ScreenHeader title="Clientes" subtitle="Directorio de clientes y datos de contacto." />
      <CompactList items={['Nombre completo', 'Telefono y correo', 'Expedientes relacionados', 'Alerta verde por cliente nuevo']} />
    </View>
  );
}

function LaboralScreen() {
  return (
    <View style={styles.stack}>
      <ScreenHeader title="Laboral" subtitle="Conciliacion, junta local y tribunal laboral." />
      {laboralGroups.map((group) => (
        <CompactRow key={group.title} title={group.title} detail={group.detail} icon="business-outline" />
      ))}
    </View>
  );
}

function TeamChatScreen() {
  return (
    <View style={styles.stack}>
      <ScreenHeader
        title="Chat de equipo"
        subtitle="Comunicacion interna del despacho para mensajes, documentos y avisos rapidos."
      />

      <View style={styles.teamChatHeader}>
        <TeamChatIcon />
        <View style={styles.teamCopy}>
          <Text style={styles.cardTitle}>Equipo del despacho</Text>
          <Text style={styles.cardText}>Preparado para colaboradores, archivos PDF, Word, imagenes y reportes internos.</Text>
        </View>
      </View>

      <View style={styles.chatCard}>
        <Text style={styles.botBubble}>Administrador 1: subi el acuerdo actualizado al expediente.</Text>
        <Text style={styles.userBubble}>Colaborador 1: recibido, reviso y aviso si falta algo.</Text>
        <Text style={styles.botBubble}>Solo lectura 1: puedo descargar el PDF para consulta?</Text>
      </View>

      <View style={styles.shortcutGrid}>
        {['Adjuntar PDF', 'Subir imagen', 'Mandar Word', 'Ver archivos'].map((label) => (
          <View key={label} style={styles.shortcutButton}>
            <Text style={styles.shortcutText}>{label}</Text>
            <Ionicons name="attach-outline" size={16} color="#1d4ed8" />
          </View>
        ))}
      </View>
    </View>
  );
}

function JurisPremiumScreen({ onNavigate }: { onNavigate: (section: Section) => void }) {
  return (
    <View style={styles.stack}>
      <View style={styles.jurisHero}>
        <JurisFace />
        <View style={styles.jurisHeroCopy}>
          <Text style={styles.kicker}>Asistente interno</Text>
          <Text style={styles.screenTitle}>Juris</Text>
          <Text style={styles.screenSubtitle}>Usa frases sencillas para encontrar funciones de la app.</Text>
        </View>
      </View>

      <View style={styles.chatCard}>
        <Text style={styles.botBubble}>
          Hola, soy Juris. Puedo ayudarte a encontrar modulos, explicar pasos y guiarte dentro del despacho.
        </Text>
        <Text style={styles.userBubble}>Como registro una audiencia?</Text>
        <Text style={styles.botBubble}>
          Entra a Movimientos, selecciona Audiencia y escribe la fecha con formato 00/00/0000.
        </Text>
      </View>

      <View style={styles.shortcutGrid}>
        {[
          { label: 'Expedientes', target: 'expedientes' as Section },
          { label: 'Movimientos', target: 'movimientos' as Section },
          { label: 'Calendario', target: 'calendario' as Section },
          { label: 'Archivo', target: 'archivo' as Section },
        ].map((shortcut) => (
          <Pressable key={shortcut.label} style={styles.shortcutButton} onPress={() => onNavigate(shortcut.target)}>
            <Text style={styles.shortcutText}>{shortcut.label}</Text>
            <Ionicons name="arrow-forward" size={16} color="#1d4ed8" />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function ConfiguracionScreen({
  email,
  profileSettings,
  onProfileSettingsChange,
  onNavigate,
  onSignOut,
}: {
  email: string;
  profileSettings: ProfileSettings;
  onProfileSettingsChange: (settings: ProfileSettings) => void;
  onNavigate: (section: Section) => void;
  onSignOut: () => Promise<void>;
}) {
  const displayName = profileSettings.displayName.trim() || email.split('@')[0] || 'Colaborador';
  const updateField = (key: keyof ProfileSettings, value: string) => {
    onProfileSettingsChange({ ...profileSettings, [key]: value });
  };

  return (
    <View style={styles.stack}>
      <ScreenHeader title="Configuracion" subtitle="Perfil, seguridad, reportes y datos de la cuenta." />
      <View style={styles.profileCard}>
        <View style={[styles.profileAvatar, { backgroundColor: profileSettings.accentColor }]}>
          <Text style={styles.profileAvatarText}>{profileSettings.profileInitial.slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={styles.profileCopy}>
          <Text style={styles.cardTitle}>{displayName}</Text>
          <Text style={styles.cardText}>{profileSettings.roleLabel} - {email}</Text>
        </View>
      </View>

      <View style={styles.formPreview}>
        <Text style={styles.cardTitle}>Personalizacion</Text>
        <Text style={styles.cardText}>Estos datos son los que veran los colaboradores en el chat de equipo.</Text>

        <Text style={styles.inputLabel}>Nombre visible</Text>
        <TextInput
          onChangeText={(value) => updateField('displayName', value)}
          placeholder="Lic. Martinez"
          placeholderTextColor="#94a3b8"
          style={styles.input}
          value={profileSettings.displayName}
        />

        <Text style={styles.inputLabel}>Rol visible</Text>
        <TextInput
          onChangeText={(value) => updateField('roleLabel', value)}
          placeholder="Administrador, Colaborador, Solo lectura"
          placeholderTextColor="#94a3b8"
          style={styles.input}
          value={profileSettings.roleLabel}
        />

        <Text style={styles.inputLabel}>Inicial o distintivo</Text>
        <TextInput
          autoCapitalize="characters"
          maxLength={1}
          onChangeText={(value) => updateField('profileInitial', value || 'L')}
          placeholder="L"
          placeholderTextColor="#94a3b8"
          style={styles.input}
          value={profileSettings.profileInitial}
        />

        <Text style={styles.inputLabel}>Color del perfil</Text>
        <View style={styles.colorRow}>
          {profileColors.map((color) => {
            const active = color === profileSettings.accentColor;
            return (
              <Pressable
                key={color}
                accessibilityRole="button"
                style={[styles.colorSwatch, { backgroundColor: color }, active && styles.colorSwatchActive]}
                onPress={() => updateField('accentColor', color)}
              >
                {active && <Ionicons name="checkmark" size={18} color="#ffffff" />}
              </Pressable>
            );
          })}
        </View>
      </View>

      <CompactList items={['Cambiar contrasena', 'Anadir telefono', 'Cambiar correo', 'Enviar reporte']} />
      {JURIS_PREMIUM_UNLOCKED && (
        <Pressable style={styles.primaryAction} onPress={() => onNavigate('juris')}>
          <Text style={styles.primaryActionText}>Abrir Juris Premium</Text>
          <Ionicons name="sparkles-outline" size={18} color="#ffffff" />
        </Pressable>
      )}
      <Pressable style={styles.secondaryAction} onPress={() => Linking.openURL(PORTAL_URL)}>
        <Text style={styles.secondaryActionText}>Abrir portal web</Text>
      </Pressable>
      <Pressable style={styles.dangerAction} onPress={onSignOut}>
        <Text style={styles.dangerActionText}>Cerrar Sesion</Text>
      </Pressable>
    </View>
  );
}

function ScreenHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={styles.titleRow}>
      <View style={styles.titleCopy}>
        <Text style={styles.screenTitle}>{title}</Text>
        <Text style={styles.screenSubtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

function CompactRow({
  title,
  detail,
  icon,
}: {
  title: string;
  detail: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={styles.compactRow}>
      <View style={styles.compactIcon}>
        <Ionicons name={icon} size={19} color="#1d4ed8" />
      </View>
      <View style={styles.compactCopy}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardText}>{detail}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
    </View>
  );
}

function CompactList({ items }: { items: string[] }) {
  return (
    <View style={styles.listBox}>
      {items.map((item) => (
        <View key={item} style={styles.listItem}>
          <Ionicons name="checkmark-circle-outline" size={18} color="#15803d" />
          <Text style={styles.listText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function TeamChatIcon() {
  return (
    <View style={styles.teamIcon}>
      <View style={[styles.teamIconAvatar, styles.teamIconAvatarLeft]}>
        <Text style={styles.teamIconText}>A</Text>
      </View>
      <View style={[styles.teamIconAvatar, styles.teamIconAvatarCenter]}>
        <Text style={styles.teamIconText}>C</Text>
      </View>
      <View style={[styles.teamIconAvatar, styles.teamIconAvatarRight]}>
        <Text style={styles.teamIconText}>L</Text>
      </View>
    </View>
  );
}

function JurisFace({ compact = false }: { compact?: boolean }) {
  return (
    <View style={[styles.jurisFace, compact && styles.jurisFaceCompact]}>
      <View style={styles.jurisAntenna} />
      <View style={styles.jurisEyes}>
        <View style={styles.jurisEye} />
        <View style={styles.jurisEye} />
      </View>
      <View style={styles.jurisMouth} />
    </View>
  );
}

const toneBackgrounds: Record<Tone, string> = {
  blue: '#eff6ff',
  green: '#ecfdf5',
  orange: '#fff7ed',
  cyan: '#ecfeff',
  slate: '#f8fafc',
  indigo: '#eef2ff',
};

const toneText: Record<Tone, string> = {
  blue: '#1e40af',
  green: '#14532d',
  orange: '#9a3412',
  cyan: '#155e75',
  slate: '#334155',
  indigo: '#3730a3',
};

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
    width: 82,
    height: 82,
  },
  loadingText: {
    color: '#e5edf8',
    fontSize: 15,
    fontWeight: '700',
  },
  authShell: {
    width: '100%',
    overflow: 'hidden',
    borderRadius: 6,
    backgroundColor: '#ffffff',
  },
  authHeader: {
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 28,
    backgroundColor: '#020617',
  },
  authLogo: {
    width: 56,
    height: 56,
  },
  authTitle: {
    marginTop: 12,
    color: '#ffffff',
    fontSize: 25,
    fontWeight: '900',
    textAlign: 'center',
  },
  authSubtitle: {
    marginTop: 8,
    color: '#dbeafe',
    fontSize: 14,
    textAlign: 'center',
  },
  authCard: {
    padding: 24,
    backgroundColor: '#ffffff',
  },
  authCardTitle: {
    color: '#0f172a',
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 16,
  },
  inputLabel: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 8,
  },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    marginBottom: 14,
    paddingHorizontal: 14,
    backgroundColor: '#ffffff',
    color: '#0f172a',
    fontSize: 16,
  },
  primaryButton: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    marginTop: 4,
    backgroundColor: '#1d4ed8',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
  },
  authDivider: {
    height: 1,
    marginVertical: 20,
    backgroundColor: '#e2e8f0',
  },
  secondaryButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 6,
  },
  secondaryButtonText: {
    color: '#1d4ed8',
    fontSize: 15,
    fontWeight: '900',
  },
  portalLink: {
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
    marginTop: 8,
  },
  portalLinkText: {
    color: '#1d4ed8',
    fontWeight: '800',
  },
  errorBox: {
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 6,
    marginBottom: 14,
    padding: 12,
    overflow: 'hidden',
    backgroundColor: '#fef2f2',
    color: '#b91c1c',
    lineHeight: 19,
  },
  successBox: {
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 6,
    marginBottom: 14,
    padding: 12,
    overflow: 'hidden',
    backgroundColor: '#eff6ff',
    color: '#1e40af',
    lineHeight: 19,
  },
  appShell: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },
  appHeader: {
    borderBottomWidth: 2,
    borderBottomColor: '#1d4ed8',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 34 : 8,
    paddingBottom: 14,
  },
  headerLogo: {
    width: 45,
    height: 45,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '900',
  },
  headerSubtitle: {
    color: '#cbd5e1',
    fontSize: 12,
    marginTop: 2,
  },
  headerAvatar: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    borderRadius: 19,
  },
  headerAvatarText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
  },
  headerIconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 6,
  },
  navScroll: {
    paddingHorizontal: 10,
    backgroundColor: '#ffffff',
  },
  navItem: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    paddingHorizontal: 12,
  },
  navItemActive: {
    borderBottomColor: '#1d4ed8',
    backgroundColor: '#eff6ff',
  },
  navText: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '800',
  },
  navTextActive: {
    color: '#1d4ed8',
  },
  content: {
    flex: 1,
  },
  contentInner: {
    padding: 16,
    paddingBottom: 34,
  },
  stack: {
    gap: 14,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  titleCopy: {
    flex: 1,
  },
  screenTitle: {
    color: '#1e40af',
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 30,
  },
  screenSubtitle: {
    marginTop: 5,
    color: '#475569',
    fontSize: 14,
    lineHeight: 20,
  },
  quickLinksRow: {
    gap: 8,
    paddingVertical: 2,
  },
  quickLink: {
    minHeight: 39,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 6,
    paddingHorizontal: 12,
    backgroundColor: '#ffffff',
  },
  quickLinkText: {
    color: '#1e40af',
    fontSize: 13,
    fontWeight: '900',
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statCard: {
    width: '48.5%',
    minHeight: 112,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#dbeafe',
    borderRadius: 6,
    padding: 14,
  },
  statCard_blue: {
    backgroundColor: toneBackgrounds.blue,
  },
  statCard_green: {
    backgroundColor: toneBackgrounds.green,
  },
  statCard_orange: {
    backgroundColor: toneBackgrounds.orange,
  },
  statCard_cyan: {
    backgroundColor: toneBackgrounds.cyan,
  },
  statCard_slate: {
    backgroundColor: toneBackgrounds.slate,
  },
  statCard_indigo: {
    backgroundColor: toneBackgrounds.indigo,
  },
  statText_blue: {
    color: toneText.blue,
  },
  statText_green: {
    color: toneText.green,
  },
  statText_orange: {
    color: toneText.orange,
  },
  statText_cyan: {
    color: toneText.cyan,
  },
  statText_slate: {
    color: toneText.slate,
  },
  statText_indigo: {
    color: toneText.indigo,
  },
  statLabel: {
    maxWidth: 105,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
  },
  statValue: {
    marginTop: 8,
    fontSize: 27,
    fontWeight: '900',
  },
  statIcon: {
    width: 43,
    height: 43,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    backgroundColor: '#dbeafe',
  },
  teamCard: {
    minHeight: 118,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 6,
    padding: 15,
    backgroundColor: '#ffffff',
  },
  teamCopy: {
    flex: 1,
  },
  kicker: {
    color: '#1d4ed8',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  cardTitle: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '900',
  },
  cardText: {
    marginTop: 5,
    color: '#64748b',
    fontSize: 13,
    lineHeight: 19,
  },
  reportCard: {
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 6,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
  },
  reportHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    padding: 15,
  },
  reportCount: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  reportList: {
    gap: 10,
    padding: 12,
  },
  reportItem: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 12,
  },
  report_movimiento: {
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
  },
  report_expediente: {
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
  },
  report_cliente: {
    borderColor: '#bbf7d0',
    backgroundColor: '#f0fdf4',
  },
  reportLabel: {
    color: '#0f172a',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  reportDetail: {
    marginTop: 5,
    color: '#334155',
    fontSize: 13,
    lineHeight: 18,
  },
  compactRow: {
    minHeight: 86,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#dbeafe',
    borderRadius: 6,
    padding: 14,
    backgroundColor: '#ffffff',
  },
  compactIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    backgroundColor: '#eff6ff',
  },
  compactCopy: {
    flex: 1,
  },
  listBox: {
    borderWidth: 1,
    borderColor: '#dbeafe',
    borderRadius: 6,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
  },
  listItem: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingHorizontal: 14,
  },
  listText: {
    flex: 1,
    color: '#334155',
    fontSize: 14,
    fontWeight: '700',
  },
  formPreview: {
    borderWidth: 1,
    borderColor: '#dbeafe',
    borderRadius: 6,
    padding: 14,
    backgroundColor: '#ffffff',
  },
  selectLike: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    marginBottom: 14,
    paddingHorizontal: 12,
    backgroundColor: '#ffffff',
  },
  selectLikeText: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '700',
  },
  placeholderText: {
    color: '#94a3b8',
    fontSize: 15,
    fontWeight: '700',
  },
  calendarBox: {
    flexDirection: 'row',
    gap: 13,
    borderWidth: 1,
    borderColor: '#dbeafe',
    borderRadius: 6,
    padding: 14,
    backgroundColor: '#ffffff',
  },
  calendarDate: {
    width: 72,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    backgroundColor: '#eff6ff',
  },
  calendarDay: {
    color: '#1e40af',
    fontSize: 12,
    fontWeight: '900',
  },
  calendarNumber: {
    color: '#1e40af',
    fontSize: 27,
    fontWeight: '900',
  },
  calendarCopy: {
    flex: 1,
    justifyContent: 'center',
  },
  teamChatHeader: {
    minHeight: 112,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 6,
    padding: 14,
    backgroundColor: '#ffffff',
  },
  jurisHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 6,
    padding: 16,
    backgroundColor: '#eff6ff',
  },
  jurisHeroCopy: {
    flex: 1,
  },
  chatCard: {
    gap: 11,
    borderWidth: 1,
    borderColor: '#dbeafe',
    borderRadius: 6,
    padding: 14,
    backgroundColor: '#ffffff',
  },
  botBubble: {
    alignSelf: 'flex-start',
    maxWidth: '90%',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 6,
    padding: 12,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    color: '#0f172a',
    lineHeight: 19,
  },
  userBubble: {
    alignSelf: 'flex-end',
    maxWidth: '86%',
    borderRadius: 6,
    padding: 12,
    overflow: 'hidden',
    backgroundColor: '#1d4ed8',
    color: '#ffffff',
    lineHeight: 19,
  },
  shortcutGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  shortcutButton: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 6,
    paddingHorizontal: 12,
    backgroundColor: '#ffffff',
  },
  shortcutText: {
    color: '#1d4ed8',
    fontSize: 13,
    fontWeight: '900',
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    borderWidth: 1,
    borderColor: '#dbeafe',
    borderRadius: 6,
    padding: 14,
    backgroundColor: '#ffffff',
  },
  profileLogo: {
    width: 48,
    height: 48,
  },
  profileAvatar: {
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 27,
  },
  profileAvatarText: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '900',
  },
  profileCopy: {
    flex: 1,
  },
  colorRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 2,
  },
  colorSwatch: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    borderRadius: 19,
  },
  colorSwatchActive: {
    borderColor: '#0f172a',
  },
  primaryAction: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 6,
    backgroundColor: '#1d4ed8',
  },
  primaryActionText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
  },
  secondaryAction: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 6,
    backgroundColor: '#ffffff',
  },
  secondaryActionText: {
    color: '#1d4ed8',
    fontSize: 15,
    fontWeight: '900',
  },
  dangerAction: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    backgroundColor: '#be123c',
  },
  dangerActionText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
  },
  teamIcon: {
    width: 58,
    height: 58,
    justifyContent: 'center',
  },
  teamIconAvatar: {
    position: 'absolute',
    width: 35,
    height: 35,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
    borderRadius: 18,
    backgroundColor: '#1d4ed8',
  },
  teamIconAvatarLeft: {
    left: 0,
    top: 16,
    backgroundColor: '#0f766e',
  },
  teamIconAvatarCenter: {
    left: 12,
    top: 0,
    zIndex: 2,
    backgroundColor: '#1d4ed8',
  },
  teamIconAvatarRight: {
    right: 0,
    top: 16,
    backgroundColor: '#7c3aed',
  },
  teamIconText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
  },
  jurisFace: {
    width: 76,
    height: 76,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#bfdbfe',
    borderRadius: 22,
    backgroundColor: '#2563eb',
    shadowColor: '#1d4ed8',
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  jurisFaceCompact: {
    width: 56,
    height: 56,
    borderRadius: 16,
  },
  jurisAntenna: {
    position: 'absolute',
    top: -13,
    width: 2,
    height: 12,
    backgroundColor: '#bfdbfe',
  },
  jurisEyes: {
    flexDirection: 'row',
    gap: 12,
  },
  jurisEye: {
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: '#ffffff',
  },
  jurisMouth: {
    width: 35,
    height: 7,
    borderRadius: 5,
    marginTop: 13,
    backgroundColor: '#dbeafe',
  },
});
