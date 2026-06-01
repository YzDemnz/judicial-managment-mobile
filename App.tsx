import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as Notifications from 'expo-notifications';
import type { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useState } from 'react';
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

interface CalendarEvent {
  id: string;
  title: string;
  dateInput: string;
  timeInput: string;
  eventAt: string;
  notificationIds: string[];
  createdAt: string;
}

type MateriaJuzgado = 'Mercantil' | 'Civil' | 'Familiar' | 'Letrado' | 'Penal';
type DespachoRole = 'owner' | 'admin' | 'editor' | 'viewer';
type NotificationPermissionStatus = 'unknown' | 'granted' | 'denied' | 'unsupported';

interface JuzgadoTorreon {
  id: string;
  nombre: string;
  materia: MateriaJuzgado;
}

interface Despacho {
  id: string;
  nombre: string;
  owner_user_id: string;
  deleted_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

interface DespachoMember {
  id: string;
  despacho_id: string;
  user_id: string;
  email: string;
  role: DespachoRole;
  display_name?: string | null;
  profile_color?: string | null;
  avatar_url?: string | null;
  created_at: string;
  despacho?: Despacho | null;
}

interface ChatMessage {
  id: string;
  despacho_id: string;
  sender_user_id: string;
  body: string;
  created_at: string;
}

interface MobileExpediente {
  id: string;
  numero_expediente: string;
  partes: string;
  juzgado: string;
  materia?: string | null;
  tipo_juicio?: string | null;
  estatus: string;
  despacho_id?: string | null;
  created_at: string;
  updated_at?: string | null;
}

interface MobileMovimiento {
  id: string;
  expediente_id: string;
  fecha: string;
  tipo: string;
  descripcion: string;
  despacho_id?: string | null;
  created_at: string;
}

interface ChatAttachment {
  id: string;
  message_id: string;
  despacho_id: string;
  storage_path: string;
  file_name: string;
  file_type: string;
  file_size: number;
  uploaded_by: string;
  created_at: string;
}

interface SelectedChatFile {
  uri: string;
  name: string;
  mimeType: string;
  size: number;
  file?: File;
}

const logo = require('./assets/brand-icon.png');
const PROFILE_STORAGE_KEY = 'judicial-mobile-profile-settings';
const CALENDAR_EVENTS_STORAGE_KEY = 'judicial-mobile-calendar-events';
const NOTIFICATION_CHANNEL_ID = 'audiencias';
const CHAT_FILES_BUCKET = 'despacho-chat-files';
const DOCUMENT_FILES_BUCKET = 'despacho-document-files';
const MAX_CHAT_FILE_SIZE = 25 * 1024 * 1024;
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

const reportItems: ReportItem[] = [];

const materiasJuzgado: MateriaJuzgado[] = ['Mercantil', 'Civil', 'Familiar', 'Letrado', 'Penal'];

const juzgadosTorreon: JuzgadoTorreon[] = [
  { id: 'mercantil-primero', nombre: 'Juzgado Primero de Primera Instancia en Materia Mercantil', materia: 'Mercantil' },
  { id: 'mercantil-segundo', nombre: 'Juzgado Segundo de Primera Instancia en Materia Mercantil', materia: 'Mercantil' },
  { id: 'mercantil-tercero', nombre: 'Juzgado Tercero de Primera Instancia en Materia Mercantil', materia: 'Mercantil' },
  { id: 'civil-primero', nombre: 'Juzgado Primero de Primera Instancia en Materia Civil', materia: 'Civil' },
  { id: 'civil-segundo', nombre: 'Juzgado Segundo de Primera Instancia en Materia Civil', materia: 'Civil' },
  { id: 'civil-tercero', nombre: 'Juzgado Tercero de Primera Instancia en Materia Civil', materia: 'Civil' },
  { id: 'civil-cuarto', nombre: 'Juzgado Cuarto de Primera Instancia en Materia Civil', materia: 'Civil' },
  { id: 'civil-quinto', nombre: 'Juzgado Quinto de Primera Instancia en Materia Civil con Especializacion Hipotecaria', materia: 'Civil' },
  { id: 'civil-sexto', nombre: 'Juzgado Sexto de Primera Instancia en Materia Civil con Especializacion Hipotecaria', materia: 'Civil' },
  { id: 'familiar-primero', nombre: 'Juzgado Primero de Primera Instancia en Materia Familiar', materia: 'Familiar' },
  { id: 'familiar-segundo', nombre: 'Juzgado Segundo de Primera Instancia en Materia Familiar', materia: 'Familiar' },
  { id: 'familiar-tercero', nombre: 'Juzgado Tercero de Primera Instancia en Materia Familiar', materia: 'Familiar' },
  { id: 'familiar-cuarto', nombre: 'Juzgado Cuarto de Primera Instancia en Materia Familiar', materia: 'Familiar' },
  { id: 'familiar-quinto', nombre: 'Juzgado Quinto de Primera Instancia en Materia Familiar', materia: 'Familiar' },
  { id: 'letrado-segundo', nombre: 'Juzgado Segundo Letrado Civil', materia: 'Letrado' },
  { id: 'letrado-tercero', nombre: 'Juzgado Tercero Letrado Civil', materia: 'Letrado' },
  { id: 'penal-sistema-acusatorio-oral', nombre: 'Juzgado de Primera Instancia en Materia Penal del Sistema Acusatorio y Oral', materia: 'Penal' },
];

const tiposJuicioPorMateria: Record<MateriaJuzgado, string[]> = {
  Mercantil: [
    'Juicio Ejecutivo Mercantil',
    'Juicio Ordinario Mercantil',
    'Juicio Oral Mercantil',
    'Jurisdiccion Voluntaria Mercantil',
    'Medios Preparatorios a Juicio Mercantil',
  ],
  Civil: [
    'Juicio Ordinario Civil',
    'Juicio Ejecutivo Civil',
    'Juicio Sumario Civil',
    'Jurisdiccion Voluntaria Civil',
    'Medios Preparatorios a Juicio Civil',
  ],
  Familiar: [
    'Juicio Oral Familiar',
    'Divorcio',
    'Alimentos',
    'Guarda y Custodia',
    'Convivencia Familiar',
    'Sucesorio Familiar',
  ],
  Letrado: [
    'Juicio Civil de Menor Cuantia',
    'Juicio Mercantil de Menor Cuantia',
    'Diligencias de Jurisdiccion Voluntaria',
  ],
  Penal: ['Causa Penal', 'Control', 'Juicio Oral Penal', 'Ejecucion Penal', 'Medidas de Proteccion'],
};

const movimientoTipos = [
  'Audiencia',
  'Presentacion de Pruebas',
  'Alegatos',
  'Resolucion',
  'Apelacion',
  'Otros',
];

const laboralGroups = [
  { title: 'Conciliacion', detail: 'Nombre de partes, fecha y hoja de conciliacion.' },
  { title: 'Junta Local de Conciliacion y Arbitraje', detail: 'Expedientes laborales previos al nuevo sistema.' },
  { title: 'Tribunal Laboral', detail: 'Procedimiento ordinario, especial y audiencias.' },
];

const profileColors = ['#1d4ed8', '#0f766e', '#7c3aed', '#be123c', '#ca8a04'];

const roleLabels: Record<DespachoRole, string> = {
  owner: 'Propietario',
  admin: 'Administrador',
  editor: 'Editor',
  viewer: 'Solo lectura',
};

const genericNameLabels: Record<DespachoRole, string> = {
  owner: 'Propietario',
  admin: 'Administrador',
  editor: 'Colaborador',
  viewer: 'Solo lectura',
};

const allowedChatMimeByExtension: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

const chatDocumentTypes = [...new Set([...Object.values(allowedChatMimeByExtension), 'image/*'])];

const defaultProfileSettings: ProfileSettings = {
  displayName: '',
  roleLabel: 'Colaborador',
  profileInitial: 'L',
  accentColor: profileColors[0],
};

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

const parseCalendarDate = (dateText: string, timeText: string) => {
  const cleanDate = dateText.trim();
  const cleanTime = timeText.trim() || '09:00';
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(cleanDate);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(cleanTime);

  if (!match || !timeMatch) return null;

  const day = Number(match[1]);
  const month = Number(match[2]) - 1;
  const year = Number(match[3]);
  const hours = Number(timeMatch[1]);
  const minutes = Number(timeMatch[2]);
  const date = new Date(year, month, day, hours, minutes, 0, 0);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day ||
    date.getHours() !== hours ||
    date.getMinutes() !== minutes
  ) {
    return null;
  }

  return date;
};

const formatCalendarDate = (isoDate: string) => {
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(isoDate));
};

const getPermissionLabel = (status: NotificationPermissionStatus) => {
  if (status === 'granted') return 'Notificaciones activadas';
  if (status === 'denied') return 'Permiso bloqueado';
  if (status === 'unsupported') return 'Disponible en app instalada';
  return 'Permiso pendiente';
};

const getFileExtension = (fileName: string) => fileName.split('.').pop()?.toLowerCase() ?? '';

const getSupportedFileType = (fileName: string, mimeType?: string | null) => {
  const extension = getFileExtension(fileName);
  return allowedChatMimeByExtension[extension] ?? mimeType ?? 'application/octet-stream';
};

const isAllowedChatFile = (fileName: string) => {
  return Boolean(allowedChatMimeByExtension[getFileExtension(fileName)]);
};

const isAllowedDocumentFile = isAllowedChatFile;

const safeFileName = (fileName: string) => {
  const extension = getFileExtension(fileName);
  const baseName = fileName
    .replace(/\.[^.]+$/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'archivo';

  return extension ? `${baseName}.${extension}` : baseName;
};

const formatMessageTime = (dateValue: string) => {
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(dateValue));
};

const formatFileSize = (size: number) => {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const getDespachoName = (membership?: DespachoMember | null) => {
  return membership?.despacho?.nombre ?? 'Despacho';
};

const canEditMembership = (membership?: DespachoMember | null) => {
  return Boolean(membership && membership.role !== 'viewer');
};

const isAudiencia = (tipo: string) => tipo.trim().toLowerCase() === 'audiencia';

const toDateInputValue = (date = new Date()) => {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

const parseMexicanDateToDatabase = (value: string) => {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day);
  const valid =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day;

  if (!valid) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
};

const toMexicanDateFromDatabase = (value: string) => {
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
};

const getMateriaJuzgados = (materia: MateriaJuzgado) => juzgadosTorreon.filter((juzgado) => juzgado.materia === materia);

const getMateriaFromJuzgado = (juzgadoNombre: string): MateriaJuzgado => {
  return juzgadosTorreon.find((juzgado) => juzgado.nombre === juzgadoNombre)?.materia ?? 'Mercantil';
};

const getMateriaForExpediente = (expediente: MobileExpediente): MateriaJuzgado => {
  return (expediente.materia as MateriaJuzgado | undefined) ?? getMateriaFromJuzgado(expediente.juzgado);
};

const getShortCourtName = (juzgado: string) => {
  return juzgado
    .replace('Juzgado ', '')
    .replace(' de Primera Instancia en Materia ', ' ')
    .replace(' de Primera Instancia en Materia', ' ')
    .replace(' con Especializacion Hipotecaria', ' Hipotecario');
};

const createEmptyExpedienteForm = (materia: MateriaJuzgado, juzgado: string) => ({
  numero_expediente: '',
  partes: '',
  materia,
  juzgado,
  tipo_juicio: tiposJuicioPorMateria[materia][0],
  estatus: 'Activo',
});

const pickSupportedDocumentFile = async () => {
  const result = await DocumentPicker.getDocumentAsync({
    type: chatDocumentTypes,
    multiple: false,
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets?.[0]) return { file: null, error: '' };

  const asset = result.assets[0];
  const assetFile = typeof File !== 'undefined' && asset.file instanceof File ? asset.file : undefined;
  const size = asset.size ?? assetFile?.size ?? 0;
  const mimeType = getSupportedFileType(asset.name, asset.mimeType);

  if (!isAllowedDocumentFile(asset.name)) {
    return { file: null, error: 'Solo se permiten imagenes, PDF, Word .doc y Word .docx.' };
  }

  if (size > MAX_CHAT_FILE_SIZE) {
    return { file: null, error: 'El archivo debe pesar 25 MB o menos.' };
  }

  return {
    file: {
      uri: asset.uri,
      name: asset.name,
      mimeType,
      size: size || 1,
      file: assetFile,
    } satisfies SelectedChatFile,
    error: '',
  };
};

const uploadDocumentAttachment = async ({
  despachoId,
  targetType,
  targetId,
  file,
  userId,
}: {
  despachoId: string;
  targetType: 'expediente' | 'movimiento';
  targetId: string;
  file: SelectedChatFile;
  userId: string;
}) => {
  const targetFolder = targetType === 'expediente' ? 'expedientes' : 'movimientos';
  const storagePath = `${despachoId}/${targetFolder}/${targetId}/${Date.now()}-${safeFileName(file.name)}`;
  const uploadBody = file.file ?? (await fetch(file.uri).then((response) => response.arrayBuffer()));
  const fileSize = file.file?.size ?? (uploadBody instanceof ArrayBuffer ? uploadBody.byteLength : file.size);

  const { error: uploadError } = await supabase.storage
    .from(DOCUMENT_FILES_BUCKET)
    .upload(storagePath, uploadBody, {
      contentType: file.mimeType,
      upsert: false,
    });

  if (uploadError) throw uploadError;

  const { error: insertError } = await supabase.from('document_adjuntos').insert([
    {
      despacho_id: despachoId,
      target_type: targetType,
      expediente_id: targetType === 'expediente' ? targetId : null,
      movimiento_id: targetType === 'movimiento' ? targetId : null,
      storage_path: storagePath,
      file_name: file.name,
      file_type: file.mimeType,
      file_size: fileSize || file.size || 1,
      uploaded_by: userId,
    },
  ]);

  if (insertError) {
    await supabase.storage.from(DOCUMENT_FILES_BUCKET).remove([storagePath]);
    throw insertError;
  }
};

const normalizeForModeration = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const moderationRules: Array<{ category: string; terms: string[] }> = [
  {
    category: 'violencia_o_delito',
    terms: [
      'voy a matar',
      'hay que matar',
      'amenazar a',
      'extorsionar',
      'sobornar al juez',
      'sobornar al secretario',
      'falsificar documentos',
      'fabricar pruebas',
      'desaparecer pruebas',
    ],
  },
  {
    category: 'odio_o_discriminacion',
    terms: [
      'odio racial',
      'raza inferior',
      'ataque racista',
      'lenguaje racista',
      'discriminar por raza',
      'discriminar por religion',
      'discriminar por orientacion',
    ],
  },
  {
    category: 'amenaza_o_acoso',
    terms: [
      'te voy a buscar',
      'te voy a destruir',
      'voy a hacerle dano',
      'chantajear',
      'publicar sus datos',
      'filtrar sus datos',
    ],
  },
];

const detectModerationRisk = (value: string) => {
  const normalizedValue = normalizeForModeration(value);

  for (const rule of moderationRules) {
    const matchedTerms = rule.terms.filter((term) => normalizedValue.includes(normalizeForModeration(term)));
    if (matchedTerms.length > 0) {
      return {
        category: rule.category,
        terms: matchedTerms,
      };
    }
  }

  return null;
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
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [notificationStatus, setNotificationStatus] = useState<NotificationPermissionStatus>('unknown');
  const [memberships, setMemberships] = useState<DespachoMember[]>([]);
  const [selectedMembership, setSelectedMembership] = useState<DespachoMember | null>(null);
  const [loadingMemberships, setLoadingMemberships] = useState(false);
  const [membershipError, setMembershipError] = useState('');

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

  const fetchMemberships = useCallback(async () => {
    if (!session?.user.id) {
      setMemberships([]);
      setSelectedMembership(null);
      return;
    }

    setLoadingMemberships(true);
    setMembershipError('');

    const { data, error: membershipsFetchError } = await supabase
      .from('despacho_miembros')
      .select('*, despacho:despachos(*)')
      .order('created_at', { ascending: true });

    if (membershipsFetchError) {
      setMembershipError(membershipsFetchError.message);
      setMemberships([]);
      setSelectedMembership(null);
      setLoadingMemberships(false);
      return;
    }

    const activeMemberships = ((data ?? []) as DespachoMember[]).filter((membership) => !membership.despacho?.deleted_at);
    setMemberships(activeMemberships);
    setSelectedMembership((current) => {
      if (current && activeMemberships.some((membership) => membership.id === current.id)) return current;
      return activeMemberships[0] ?? null;
    });
    setLoadingMemberships(false);
  }, [session?.user.id]);

  useEffect(() => {
    fetchMemberships().catch(() => {
      setMembershipError('No se pudieron cargar los despachos.');
      setLoadingMemberships(false);
    });
  }, [fetchMemberships]);

  useEffect(() => {
    let mounted = true;

    AsyncStorage.getItem(CALENDAR_EVENTS_STORAGE_KEY)
      .then((savedEvents) => {
        if (!mounted || !savedEvents) return;
        const parsedEvents = JSON.parse(savedEvents) as CalendarEvent[];
        setCalendarEvents(parsedEvents.sort((a, b) => new Date(a.eventAt).getTime() - new Date(b.eventAt).getTime()));
      })
      .catch(() => undefined);

    return () => {
      mounted = false;
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
    if (selectedMembership) {
      void (async () => {
        await supabase
          .from('despacho_miembros')
          .update({
            display_name: nextSettings.displayName.trim() || null,
            profile_color: nextSettings.accentColor,
            profile_updated_at: new Date().toISOString(),
          })
          .eq('id', selectedMembership.id);
        await fetchMemberships();
      })().catch(() => undefined);
    }
  };

  const saveCalendarEvents = (nextEvents: CalendarEvent[]) => {
    const sortedEvents = [...nextEvents].sort((a, b) => new Date(a.eventAt).getTime() - new Date(b.eventAt).getTime());
    setCalendarEvents(sortedEvents);
    AsyncStorage.setItem(CALENDAR_EVENTS_STORAGE_KEY, JSON.stringify(sortedEvents)).catch(() => undefined);
  };

  const requestNotificationPermission = async () => {
    if (Platform.OS === 'web') {
      setNotificationStatus('unsupported');
      return false;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNEL_ID, {
        name: 'Audiencias y calendario',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#1d4ed8',
      });
    }

    const existingPermission = await Notifications.getPermissionsAsync();
    let finalStatus = existingPermission.status;

    if (finalStatus !== 'granted') {
      const requestedPermission = await Notifications.requestPermissionsAsync();
      finalStatus = requestedPermission.status;
    }

    const granted = finalStatus === 'granted';
    setNotificationStatus(granted ? 'granted' : 'denied');
    return granted;
  };

  const scheduleCalendarNotifications = async (title: string, eventDate: Date) => {
    if (Platform.OS === 'web') return [] as string[];

    const granted = await requestNotificationPermission();
    if (!granted) return [] as string[];

    const notificationDates = [
      {
        date: new Date(eventDate.getTime() - 24 * 60 * 60 * 1000),
        body: `Manana tienes: ${title}`,
      },
      {
        date: eventDate,
        body: `Hoy tienes: ${title}`,
      },
    ].filter((item) => item.date.getTime() > Date.now() + 60 * 1000);

    const notificationIds: string[] = [];

    for (const notificationDate of notificationDates) {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Audiencia programada',
          body: notificationDate.body,
          data: { type: 'calendar-event', title, eventAt: eventDate.toISOString() },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: notificationDate.date,
          channelId: NOTIFICATION_CHANNEL_ID,
        },
      });
      notificationIds.push(id);
    }

    return notificationIds;
  };

  const createCalendarEvent = async (title: string, dateInput: string, timeInput: string) => {
    const cleanTitle = title.trim() || 'Audiencia';
    const eventDate = parseCalendarDate(dateInput, timeInput);

    if (!eventDate) {
      return { ok: false, message: 'Usa fecha 00/00/0000 y hora 00:00.' };
    }

    if (eventDate.getTime() <= Date.now()) {
      return { ok: false, message: 'La fecha debe ser futura para poder programar avisos.' };
    }

    const notificationIds = await scheduleCalendarNotifications(cleanTitle, eventDate);
    const nextEvent: CalendarEvent = {
      id: `${Date.now()}`,
      title: cleanTitle,
      dateInput: dateInput.trim(),
      timeInput: timeInput.trim() || '09:00',
      eventAt: eventDate.toISOString(),
      notificationIds,
      createdAt: new Date().toISOString(),
    };

    saveCalendarEvents([...calendarEvents, nextEvent]);

    if (Platform.OS === 'web') {
      return { ok: true, message: 'Evento guardado. Las notificaciones se activan en la app instalada.' };
    }

    if (notificationIds.length === 0) {
      return { ok: true, message: 'Evento guardado. No se pudieron programar avisos porque falta el permiso.' };
    }

    return { ok: true, message: 'Evento guardado con avisos un dia antes y el mismo dia.' };
  };

  const deleteCalendarEvent = async (eventId: string) => {
    const event = calendarEvents.find((item) => item.id === eventId);
    if (event && Platform.OS !== 'web') {
      await Promise.all(
        event.notificationIds.map((notificationId) =>
          Notifications.cancelScheduledNotificationAsync(notificationId).catch(() => undefined),
        ),
      );
    }

    saveCalendarEvents(calendarEvents.filter((item) => item.id !== eventId));
  };

  const displayEmail = useMemo(() => session?.user.email ?? 'Cuenta', [session?.user.email]);
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
            data: { signup_source: 'judicial_mobile' },
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
              <Text style={styles.headerSubtitle}>
                {selectedMembership ? `${displayName} - ${getDespachoName(selectedMembership)}` : displayName}
              </Text>
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
        {activeSection === 'expedientes' && (
          <ExpedientesScreen selectedMembership={selectedMembership} currentUserId={session.user.id} />
        )}
        {activeSection === 'archivo' && <ArchivoScreen onNavigate={setActiveSection} />}
        {activeSection === 'movimientos' && (
          <MovimientosScreen
            selectedMembership={selectedMembership}
            currentUserId={session.user.id}
            onCreateCalendarEvent={createCalendarEvent}
          />
        )}
        {activeSection === 'calendario' && (
          <CalendarioScreen
            events={calendarEvents}
            notificationStatus={notificationStatus}
            onCreateCalendarEvent={createCalendarEvent}
            onDeleteCalendarEvent={deleteCalendarEvent}
            onRequestPermission={requestNotificationPermission}
          />
        )}
        {activeSection === 'clientes' && <ClientesScreen />}
        {activeSection === 'laboral' && <LaboralScreen />}
        {activeSection === 'teamChat' && (
          <TeamChatScreen
            currentUserId={session.user.id}
            memberships={memberships}
            selectedMembership={selectedMembership}
            loadingMemberships={loadingMemberships}
            membershipError={membershipError}
            onRefreshMemberships={fetchMemberships}
            onSelectMembership={setSelectedMembership}
          />
        )}
        {activeSection === 'juris' && JURIS_PREMIUM_UNLOCKED && <JurisPremiumScreen onNavigate={setActiveSection} />}
        {activeSection === 'juris' && !JURIS_PREMIUM_UNLOCKED && <DashboardScreen onNavigate={setActiveSection} />}
        {activeSection === 'configuracion' && (
          <ConfiguracionScreen
            email={displayEmail}
            selectedMembership={selectedMembership}
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
          {reportItems.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateTitle}>Sin reportes recientes</Text>
              <Text style={styles.emptyStateText}>Sin actividad nueva por ahora.</Text>
            </View>
          ) : (
            reportItems.map((item) => (
              <View key={item.label} style={[styles.reportItem, styles[`report_${item.type}`]]}>
                <Text style={styles.reportLabel}>{item.label}</Text>
                <Text style={styles.reportDetail}>{item.detail}</Text>
              </View>
            ))
          )}
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

function ExpedientesScreen({
  selectedMembership,
  currentUserId,
}: {
  selectedMembership: DespachoMember | null;
  currentUserId: string;
}) {
  const despachoId = selectedMembership?.despacho_id ?? '';
  const canEdit = canEditMembership(selectedMembership);
  const [expedientes, setExpedientes] = useState<MobileExpediente[]>([]);
  const [selectedMateria, setSelectedMateria] = useState<MateriaJuzgado | null>(null);
  const [selectedJuzgado, setSelectedJuzgado] = useState<JuzgadoTorreon | null>(null);
  const [formData, setFormData] = useState(createEmptyExpedienteForm('Mercantil', juzgadosTorreon[0].nombre));
  const [selectedFile, setSelectedFile] = useState<SelectedChatFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const fetchExpedientes = useCallback(async () => {
    if (!despachoId) {
      setExpedientes([]);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from('expedientes')
      .select('*')
      .eq('despacho_id', despachoId)
      .order('updated_at', { ascending: false });

    if (error) {
      setErrorMessage(error.message);
      setLoading(false);
      return;
    }

    setExpedientes((data ?? []) as MobileExpediente[]);
    setLoading(false);
  }, [despachoId]);

  useEffect(() => {
    fetchExpedientes();
  }, [fetchExpedientes]);

  const selectMateria = (materia: MateriaJuzgado) => {
    setSelectedMateria(materia);
    setSelectedJuzgado(null);
    const firstJuzgado = getMateriaJuzgados(materia)[0];
    if (firstJuzgado) setFormData(createEmptyExpedienteForm(materia, firstJuzgado.nombre));
    setFeedback('');
    setErrorMessage('');
  };

  const selectJuzgado = (juzgado: JuzgadoTorreon) => {
    setSelectedMateria(juzgado.materia);
    setSelectedJuzgado(juzgado);
    setFormData(createEmptyExpedienteForm(juzgado.materia, juzgado.nombre));
    setSelectedFile(null);
    setFeedback('');
    setErrorMessage('');
  };

  const handlePickFile = async () => {
    const picked = await pickSupportedDocumentFile();
    if (picked.error) {
      setErrorMessage(picked.error);
      return;
    }
    setSelectedFile(picked.file);
  };

  const handleCreateExpediente = async () => {
    if (!despachoId) {
      setErrorMessage('Primero crea o selecciona un despacho.');
      return;
    }

    if (!canEdit) {
      setErrorMessage('Tu acceso es de solo lectura. Pide permiso de edicion al propietario.');
      return;
    }

    if (!formData.numero_expediente.trim() || !formData.partes.trim()) {
      setErrorMessage('Escribe numero de expediente y partes.');
      return;
    }

    setSaving(true);
    setFeedback('');
    setErrorMessage('');

    const payload = {
      numero_expediente: formData.numero_expediente.trim(),
      partes: formData.partes.trim(),
      juzgado: formData.juzgado,
      materia: formData.materia,
      tipo_juicio: formData.tipo_juicio,
      estatus: formData.estatus,
      despacho_id: despachoId,
    };

    const legacyPayload = {
      numero_expediente: payload.numero_expediente,
      partes: payload.partes,
      juzgado: payload.juzgado,
      estatus: payload.estatus,
      despacho_id: despachoId,
    };

    const insertResponse = await supabase.from('expedientes').insert([payload]).select('id').single();
    const retryLegacy =
      insertResponse.error?.message.includes('materia') ||
      insertResponse.error?.message.includes('tipo_juicio');
    const result = retryLegacy
      ? await supabase.from('expedientes').insert([legacyPayload]).select('id').single()
      : insertResponse;

    if (result.error || !result.data?.id) {
      setErrorMessage(result.error?.message ?? 'No se pudo guardar el expediente.');
      setSaving(false);
      return;
    }

    if (selectedFile) {
      try {
        await uploadDocumentAttachment({
          despachoId,
          targetType: 'expediente',
          targetId: result.data.id as string,
          file: selectedFile,
          userId: currentUserId,
        });
      } catch (uploadError) {
        setErrorMessage(uploadError instanceof Error ? uploadError.message : 'Expediente guardado, pero no se adjunto el archivo.');
      }
    }

    setFeedback(selectedFile ? 'Expediente guardado con archivo adjunto.' : 'Expediente guardado.');
    setFormData(createEmptyExpedienteForm(formData.materia, formData.juzgado));
    setSelectedFile(null);
    setSaving(false);
    fetchExpedientes();
  };

  const juzgados = selectedMateria ? getMateriaJuzgados(selectedMateria) : [];
  const visibleExpedientes = selectedJuzgado
    ? expedientes.filter((expediente) => expediente.juzgado === selectedJuzgado.nombre)
    : selectedMateria
      ? expedientes.filter((expediente) => getMateriaForExpediente(expediente) === selectedMateria)
      : expedientes;

  return (
    <View style={styles.stack}>
      <ScreenHeader title="Expedientes" subtitle="Materia, juzgado, expediente y documentos digitales." />

      {!selectedMembership && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateTitle}>Sin despacho seleccionado</Text>
          <Text style={styles.emptyStateText}>Crea o unete a un despacho para guardar expedientes.</Text>
        </View>
      )}

      <View style={styles.optionGrid}>
        {materiasJuzgado.map((materia) => {
          const active = selectedMateria === materia;
          const count = expedientes.filter((expediente) => getMateriaForExpediente(expediente) === materia).length;
          return (
            <Pressable key={materia} style={[styles.optionCard, active && styles.optionCardActive]} onPress={() => selectMateria(materia)}>
              <Ionicons name="folder-open-outline" size={20} color={active ? '#ffffff' : '#1d4ed8'} />
              <Text style={[styles.optionTitle, active && styles.optionTitleActive]}>{materia}</Text>
              <Text style={[styles.optionMeta, active && styles.optionMetaActive]}>{count} expediente(s)</Text>
            </Pressable>
          );
        })}
      </View>

      {selectedMateria && (
        <View style={styles.recordsStack}>
          <Text style={styles.sectionMiniTitle}>Juzgados de {selectedMateria}</Text>
          {juzgados.map((juzgado) => {
            const active = selectedJuzgado?.id === juzgado.id;
            const count = expedientes.filter((expediente) => expediente.juzgado === juzgado.nombre).length;
            return (
              <Pressable key={juzgado.id} style={[styles.compactRow, active && styles.compactRowActive]} onPress={() => selectJuzgado(juzgado)}>
                <View style={styles.compactIcon}>
                  <Ionicons name="business-outline" size={19} color="#1d4ed8" />
                </View>
                <View style={styles.compactCopy}>
                  <Text style={styles.cardTitle}>{getShortCourtName(juzgado.nombre)}</Text>
                  <Text style={styles.cardText}>{count} expediente(s)</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
              </Pressable>
            );
          })}
        </View>
      )}

      {selectedJuzgado && (
        <View style={styles.formPreview}>
          <Text style={styles.cardTitle}>Anadir expediente</Text>
          <Text style={styles.cardText}>{getShortCourtName(selectedJuzgado.nombre)}</Text>

          <Text style={styles.inputLabel}>Numero de expediente</Text>
          <TextInput
            onChangeText={(value) => setFormData({ ...formData, numero_expediente: value })}
            placeholder="142/2026"
            placeholderTextColor="#94a3b8"
            style={styles.input}
            value={formData.numero_expediente}
          />

          <Text style={styles.inputLabel}>Partes</Text>
          <TextInput
            onChangeText={(value) => setFormData({ ...formData, partes: value })}
            placeholder="Actor vs Demandado"
            placeholderTextColor="#94a3b8"
            style={styles.input}
            value={formData.partes}
          />

          <Text style={styles.inputLabel}>Tipo de juicio</Text>
          <View style={styles.chipWrap}>
            {tiposJuicioPorMateria[formData.materia].map((tipoJuicio) => {
              const active = formData.tipo_juicio === tipoJuicio;
              return (
                <Pressable
                  key={tipoJuicio}
                  style={[styles.choiceChip, active && styles.choiceChipActive]}
                  onPress={() => setFormData({ ...formData, tipo_juicio: tipoJuicio })}
                >
                  <Text style={[styles.choiceChipText, active && styles.choiceChipTextActive]}>{tipoJuicio}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.inputLabel}>Estatus</Text>
          <View style={styles.chipWrap}>
            {['Activo', 'Archivado'].map((estatus) => {
              const active = formData.estatus === estatus;
              return (
                <Pressable
                  key={estatus}
                  style={[styles.choiceChip, active && styles.choiceChipActive]}
                  onPress={() => setFormData({ ...formData, estatus })}
                >
                  <Text style={[styles.choiceChipText, active && styles.choiceChipTextActive]}>{estatus}</Text>
                </Pressable>
              );
            })}
          </View>

          {selectedFile && (
            <View style={styles.selectedFileRow}>
              <Ionicons name="attach-outline" size={18} color="#1d4ed8" />
              <View style={styles.attachmentCopy}>
                <Text style={styles.attachmentName}>{selectedFile.name}</Text>
                <Text style={styles.attachmentSize}>{formatFileSize(selectedFile.size)}</Text>
              </View>
              <Pressable style={styles.iconButton} onPress={() => setSelectedFile(null)}>
                <Ionicons name="close-outline" size={18} color="#be123c" />
              </Pressable>
            </View>
          )}

          <View style={styles.actionRow}>
            <Pressable style={styles.secondaryActionCompact} onPress={handlePickFile}>
              <Ionicons name="attach-outline" size={17} color="#1d4ed8" />
              <Text style={styles.secondaryActionCompactText}>Adjuntar</Text>
            </Pressable>
            <Pressable
              style={[styles.primaryAction, styles.actionRowPrimary, saving && styles.sendButtonDisabled]}
              onPress={handleCreateExpediente}
              disabled={saving}
            >
              <Text style={styles.primaryActionText}>{saving ? 'Guardando...' : 'Guardar expediente'}</Text>
              <Ionicons name="save-outline" size={18} color="#ffffff" />
            </Pressable>
          </View>

          {Boolean(feedback) && <Text style={styles.inlineFeedback}>{feedback}</Text>}
          {Boolean(errorMessage) && <Text style={styles.inlineError}>{errorMessage}</Text>}
        </View>
      )}

      <View style={styles.recordsStack}>
        <Text style={styles.sectionMiniTitle}>{loading ? 'Cargando expedientes...' : 'Expedientes encontrados'}</Text>
        {visibleExpedientes.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateTitle}>Sin expedientes</Text>
            <Text style={styles.emptyStateText}>Selecciona un juzgado y guarda el primer expediente.</Text>
          </View>
        ) : (
          visibleExpedientes.map((expediente) => (
            <View key={expediente.id} style={styles.recordCard}>
              <Text style={styles.cardTitle}>{expediente.numero_expediente}</Text>
              <Text style={styles.cardText}>{expediente.partes}</Text>
              <View style={styles.recordMetaRow}>
                <Text style={styles.recordPill}>{expediente.estatus}</Text>
                <Text style={styles.recordPill}>{expediente.tipo_juicio ?? getMateriaForExpediente(expediente)}</Text>
              </View>
              <Text style={styles.cardText}>{getShortCourtName(expediente.juzgado)}</Text>
            </View>
          ))
        )}
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

function MovimientosScreen({
  selectedMembership,
  currentUserId,
  onCreateCalendarEvent,
}: {
  selectedMembership: DespachoMember | null;
  currentUserId: string;
  onCreateCalendarEvent: (title: string, dateInput: string, timeInput: string) => Promise<{ ok: boolean; message: string }>;
}) {
  const despachoId = selectedMembership?.despacho_id ?? '';
  const canEdit = canEditMembership(selectedMembership);
  const [expedientes, setExpedientes] = useState<MobileExpediente[]>([]);
  const [movimientos, setMovimientos] = useState<MobileMovimiento[]>([]);
  const [selectedExpedienteId, setSelectedExpedienteId] = useState('');
  const [tipo, setTipo] = useState('Audiencia');
  const [descripcion, setDescripcion] = useState('');
  const [fecha, setFecha] = useState(toDateInputValue());
  const [hora, setHora] = useState('09:00');
  const [selectedFile, setSelectedFile] = useState<SelectedChatFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const fetchData = useCallback(async () => {
    if (!despachoId) {
      setExpedientes([]);
      setMovimientos([]);
      return;
    }

    setLoading(true);
    const [expedientesResponse, movimientosResponse] = await Promise.all([
      supabase
        .from('expedientes')
        .select('*')
        .eq('despacho_id', despachoId)
        .order('updated_at', { ascending: false }),
      supabase
        .from('movimientos')
        .select('*')
        .eq('despacho_id', despachoId)
        .order('fecha', { ascending: false }),
    ]);

    if (expedientesResponse.error || movimientosResponse.error) {
      setErrorMessage(expedientesResponse.error?.message ?? movimientosResponse.error?.message ?? 'No se pudo cargar la informacion.');
      setLoading(false);
      return;
    }

    const nextExpedientes = (expedientesResponse.data ?? []) as MobileExpediente[];
    setExpedientes(nextExpedientes);
    setMovimientos((movimientosResponse.data ?? []) as MobileMovimiento[]);
    setSelectedExpedienteId((current) => current || nextExpedientes[0]?.id || '');
    setLoading(false);
  }, [despachoId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handlePickFile = async () => {
    const picked = await pickSupportedDocumentFile();
    if (picked.error) {
      setErrorMessage(picked.error);
      return;
    }
    setSelectedFile(picked.file);
  };

  const handleCreateMovimiento = async () => {
    if (!despachoId) {
      setErrorMessage('Primero crea o selecciona un despacho.');
      return;
    }

    if (!canEdit) {
      setErrorMessage('Tu acceso es de solo lectura. Pide permiso de edicion al propietario.');
      return;
    }

    if (!selectedExpedienteId || !descripcion.trim()) {
      setErrorMessage('Selecciona expediente y escribe la descripcion.');
      return;
    }

    const databaseDate = parseMexicanDateToDatabase(fecha);
    if (!databaseDate) {
      setErrorMessage('Usa fecha con formato 00/00/0000.');
      return;
    }

    setSaving(true);
    setFeedback('');
    setErrorMessage('');

    const { data, error } = await supabase
      .from('movimientos')
      .insert([
        {
          expediente_id: selectedExpedienteId,
          despacho_id: despachoId,
          fecha: databaseDate,
          tipo,
          descripcion: descripcion.trim(),
        },
      ])
      .select('id')
      .single();

    if (error || !data?.id) {
      setErrorMessage(error?.message ?? 'No se pudo guardar el movimiento.');
      setSaving(false);
      return;
    }

    let nextMessage = 'Movimiento guardado.';

    if (isAudiencia(tipo)) {
      const calendarResult = await onCreateCalendarEvent(descripcion.trim() || 'Audiencia', fecha, hora);
      nextMessage = calendarResult.ok
        ? 'Movimiento guardado y audiencia agregada al calendario.'
        : `Movimiento guardado. ${calendarResult.message}`;
    }

    if (selectedFile) {
      try {
        await uploadDocumentAttachment({
          despachoId,
          targetType: 'movimiento',
          targetId: data.id as string,
          file: selectedFile,
          userId: currentUserId,
        });
        nextMessage = `${nextMessage} Archivo adjunto guardado.`;
      } catch (uploadError) {
        setErrorMessage(uploadError instanceof Error ? uploadError.message : 'Movimiento guardado, pero no se adjunto el archivo.');
      }
    }

    setFeedback(nextMessage);
    setDescripcion('');
    setFecha(toDateInputValue());
    setHora('09:00');
    setSelectedFile(null);
    setSaving(false);
    fetchData();
  };

  const selectedExpediente = expedientes.find((expediente) => expediente.id === selectedExpedienteId);

  return (
    <View style={styles.stack}>
      <ScreenHeader title="Movimientos" subtitle="Acuerdos, promociones, audiencias y archivos." />

      {!selectedMembership && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateTitle}>Sin despacho seleccionado</Text>
          <Text style={styles.emptyStateText}>Crea o unete a un despacho para guardar movimientos.</Text>
        </View>
      )}

      <View style={styles.formPreview}>
        <Text style={styles.inputLabel}>Tipo de movimiento</Text>
        <View style={styles.chipWrap}>
          {movimientoTipos.map((tipoMovimiento) => {
            const active = tipo === tipoMovimiento;
            return (
              <Pressable
                key={tipoMovimiento}
                style={[styles.choiceChip, active && styles.choiceChipActive]}
                onPress={() => setTipo(tipoMovimiento)}
              >
                <Text style={[styles.choiceChipText, active && styles.choiceChipTextActive]}>{tipoMovimiento}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.inputLabel}>Expediente</Text>
        {expedientes.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateTitle}>Sin expedientes</Text>
            <Text style={styles.emptyStateText}>Primero agrega un expediente para registrar movimientos.</Text>
          </View>
        ) : (
          <View style={styles.recordsStack}>
            {expedientes.slice(0, 8).map((expediente) => {
              const active = selectedExpedienteId === expediente.id;
              return (
                <Pressable
                  key={expediente.id}
                  style={[styles.compactRow, active && styles.compactRowActive]}
                  onPress={() => setSelectedExpedienteId(expediente.id)}
                >
                  <View style={styles.compactIcon}>
                    <Ionicons name="document-text-outline" size={19} color="#1d4ed8" />
                  </View>
                  <View style={styles.compactCopy}>
                    <Text style={styles.cardTitle}>{expediente.numero_expediente}</Text>
                    <Text style={styles.cardText}>{expediente.partes}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        <Text style={styles.inputLabel}>Descripcion</Text>
        <TextInput
          multiline
          onChangeText={setDescripcion}
          placeholder="Acuerdo publicado, promocion presentada, audiencia..."
          placeholderTextColor="#94a3b8"
          style={[styles.input, styles.textArea]}
          value={descripcion}
        />

        <Text style={styles.inputLabel}>{isAudiencia(tipo) ? 'Fecha de audiencia' : 'Fecha'}</Text>
        <TextInput
          keyboardType="numeric"
          onChangeText={setFecha}
          placeholder="00/00/0000"
          placeholderTextColor="#94a3b8"
          style={styles.input}
          value={fecha}
        />

        {isAudiencia(tipo) && (
          <>
            <Text style={styles.inputLabel}>Hora</Text>
            <TextInput
              keyboardType="numeric"
              onChangeText={setHora}
              placeholder="09:00"
              placeholderTextColor="#94a3b8"
              style={styles.input}
              value={hora}
            />
          </>
        )}

        {selectedFile && (
          <View style={styles.selectedFileRow}>
            <Ionicons name="attach-outline" size={18} color="#1d4ed8" />
            <View style={styles.attachmentCopy}>
              <Text style={styles.attachmentName}>{selectedFile.name}</Text>
              <Text style={styles.attachmentSize}>{formatFileSize(selectedFile.size)}</Text>
            </View>
            <Pressable style={styles.iconButton} onPress={() => setSelectedFile(null)}>
              <Ionicons name="close-outline" size={18} color="#be123c" />
            </Pressable>
          </View>
        )}

        <View style={styles.actionRow}>
          <Pressable style={styles.secondaryActionCompact} onPress={handlePickFile}>
            <Ionicons name="attach-outline" size={17} color="#1d4ed8" />
            <Text style={styles.secondaryActionCompactText}>Adjuntar</Text>
          </Pressable>
          <Pressable
            style={[styles.primaryAction, styles.actionRowPrimary, saving && styles.sendButtonDisabled]}
            onPress={handleCreateMovimiento}
            disabled={saving}
          >
            <Text style={styles.primaryActionText}>{saving ? 'Guardando...' : 'Guardar movimiento'}</Text>
            <Ionicons name="save-outline" size={18} color="#ffffff" />
          </Pressable>
        </View>

        {Boolean(feedback) && <Text style={styles.inlineFeedback}>{feedback}</Text>}
        {Boolean(errorMessage) && <Text style={styles.inlineError}>{errorMessage}</Text>}
      </View>

      <View style={styles.recordsStack}>
        <Text style={styles.sectionMiniTitle}>{loading ? 'Cargando movimientos...' : 'Movimientos recientes'}</Text>
        {movimientos.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateTitle}>Sin movimientos</Text>
            <Text style={styles.emptyStateText}>Guarda el primer movimiento del expediente.</Text>
          </View>
        ) : (
          movimientos.slice(0, 12).map((movimiento) => {
            const expediente = expedientes.find((item) => item.id === movimiento.expediente_id);
            return (
              <View key={movimiento.id} style={styles.recordCard}>
                <Text style={styles.cardTitle}>{movimiento.tipo}</Text>
                <Text style={styles.cardText}>{movimiento.descripcion}</Text>
                <View style={styles.recordMetaRow}>
                  <Text style={styles.recordPill}>{toMexicanDateFromDatabase(movimiento.fecha)}</Text>
                  <Text style={styles.recordPill}>{expediente?.numero_expediente ?? selectedExpediente?.numero_expediente ?? 'Expediente'}</Text>
                </View>
              </View>
            );
          })
        )}
      </View>
    </View>
  );
}

function CalendarioScreen({
  events,
  notificationStatus,
  onCreateCalendarEvent,
  onDeleteCalendarEvent,
  onRequestPermission,
}: {
  events: CalendarEvent[];
  notificationStatus: NotificationPermissionStatus;
  onCreateCalendarEvent: (title: string, dateInput: string, timeInput: string) => Promise<{ ok: boolean; message: string }>;
  onDeleteCalendarEvent: (eventId: string) => Promise<void>;
  onRequestPermission: () => Promise<boolean>;
}) {
  const [eventTitle, setEventTitle] = useState('Audiencia');
  const [eventDate, setEventDate] = useState('');
  const [eventTime, setEventTime] = useState('09:00');
  const [feedback, setFeedback] = useState('');

  const handleCreateEvent = async () => {
    const result = await onCreateCalendarEvent(eventTitle, eventDate, eventTime);
    setFeedback(result.message);
    if (result.ok) {
      setEventTitle('Audiencia');
      setEventDate('');
      setEventTime('09:00');
    }
  };

  const handleRequestPermission = async () => {
    const granted = await onRequestPermission();
    setFeedback(granted ? 'Notificaciones activadas correctamente.' : 'No se pudo activar el permiso de notificaciones.');
  };

  return (
    <View style={styles.stack}>
      <ScreenHeader title="Calendario" subtitle="Audiencias y vencimientos detectados desde movimientos." />

      <View style={styles.permissionCard}>
        <View style={styles.permissionCopy}>
          <Text style={styles.cardTitle}>{getPermissionLabel(notificationStatus)}</Text>
          <Text style={styles.cardText}>La app puede avisarte un dia antes y el mismo dia de cada audiencia.</Text>
        </View>
        <Pressable style={styles.smallPrimaryButton} onPress={handleRequestPermission}>
          <Text style={styles.smallPrimaryButtonText}>Activar</Text>
        </Pressable>
      </View>

      <View style={styles.formPreview}>
        <Text style={styles.cardTitle}>Nueva audiencia</Text>
        <Text style={styles.cardText}>Guarda una fecha futura para programar recordatorios automaticos.</Text>

        <Text style={styles.inputLabel}>Descripcion</Text>
        <TextInput
          onChangeText={setEventTitle}
          placeholder="Audiencia inicial"
          placeholderTextColor="#94a3b8"
          style={styles.input}
          value={eventTitle}
        />
        <Text style={styles.inputLabel}>Fecha</Text>
        <TextInput
          keyboardType="numeric"
          onChangeText={setEventDate}
          placeholder="00/00/0000"
          placeholderTextColor="#94a3b8"
          style={styles.input}
          value={eventDate}
        />
        <Text style={styles.inputLabel}>Hora</Text>
        <TextInput
          keyboardType="numeric"
          onChangeText={setEventTime}
          placeholder="09:00"
          placeholderTextColor="#94a3b8"
          style={styles.input}
          value={eventTime}
        />
        <Pressable style={styles.primaryAction} onPress={handleCreateEvent}>
          <Text style={styles.primaryActionText}>Agregar audiencia</Text>
          <Ionicons name="calendar-outline" size={18} color="#ffffff" />
        </Pressable>
        {Boolean(feedback) && <Text style={styles.inlineFeedback}>{feedback}</Text>}
      </View>

      {events.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateTitle}>Sin audiencias programadas</Text>
          <Text style={styles.emptyStateText}>Agrega una fecha para verla aqui y recibir recordatorios.</Text>
        </View>
      ) : (
        events.map((event) => (
          <View key={event.id} style={styles.calendarBox}>
            <View style={styles.calendarDate}>
              <Text style={styles.calendarDay}>{event.dateInput.slice(3, 5)}/{event.dateInput.slice(6)}</Text>
              <Text style={styles.calendarNumber}>{event.dateInput.slice(0, 2)}</Text>
            </View>
            <View style={styles.calendarCopy}>
              <Text style={styles.cardTitle}>{event.title}</Text>
              <Text style={styles.cardText}>{formatCalendarDate(event.eventAt)}</Text>
              <Text style={styles.cardText}>
                {event.notificationIds.length > 0 ? 'Avisos programados' : 'Guardado sin avisos del sistema'}
              </Text>
            </View>
            <Pressable style={styles.iconDangerButton} onPress={() => onDeleteCalendarEvent(event.id)}>
              <Ionicons name="trash-outline" size={18} color="#be123c" />
            </Pressable>
          </View>
        ))
      )}
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

function TeamChatScreen({
  currentUserId,
  memberships,
  selectedMembership,
  loadingMemberships,
  membershipError,
  onRefreshMemberships,
  onSelectMembership,
}: {
  currentUserId: string;
  memberships: DespachoMember[];
  selectedMembership: DespachoMember | null;
  loadingMemberships: boolean;
  membershipError: string;
  onRefreshMemberships: () => Promise<void>;
  onSelectMembership: (membership: DespachoMember) => void;
}) {
  const [members, setMembers] = useState<DespachoMember[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [attachmentsByMessage, setAttachmentsByMessage] = useState<Record<string, ChatAttachment[]>>({});
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({});
  const [body, setBody] = useState('');
  const [selectedFile, setSelectedFile] = useState<SelectedChatFile | null>(null);
  const [loadingChat, setLoadingChat] = useState(false);
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const despachoId = selectedMembership?.despacho_id ?? '';
  const memberByUserId = useMemo(() => new Map(members.map((member) => [member.user_id, member])), [members]);

  const getGenericMemberName = useCallback(
    (member?: DespachoMember) => {
      if (!member) return 'Colaborador';
      if (member.role === 'owner') return genericNameLabels.owner;

      const sameRoleMembers = members
        .filter((item) => item.role === member.role)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      const roleIndex = sameRoleMembers.findIndex((item) => item.id === member.id) + 1;

      return `${genericNameLabels[member.role]} ${roleIndex || 1}`;
    },
    [members],
  );

  const getMemberDisplayName = useCallback(
    (member?: DespachoMember) => {
      if (!member) return 'Colaborador';
      return member.display_name?.trim() || getGenericMemberName(member);
    },
    [getGenericMemberName],
  );

  const fetchMembers = useCallback(async () => {
    if (!despachoId) return;

    const { data, error } = await supabase
      .from('despacho_miembros')
      .select('*')
      .eq('despacho_id', despachoId)
      .order('created_at', { ascending: true });

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setMembers((data ?? []) as DespachoMember[]);
  }, [despachoId]);

  const fetchAttachments = useCallback(async (messageIds: string[]) => {
    if (messageIds.length === 0) {
      setAttachmentsByMessage({});
      setAttachmentUrls({});
      return;
    }

    const { data, error } = await supabase
      .from('despacho_chat_adjuntos')
      .select('*')
      .in('message_id', messageIds)
      .order('created_at', { ascending: true });

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    const attachments = (data ?? []) as ChatAttachment[];
    const grouped = attachments.reduce<Record<string, ChatAttachment[]>>((accumulator, attachment) => {
      accumulator[attachment.message_id] = [...(accumulator[attachment.message_id] ?? []), attachment];
      return accumulator;
    }, {});

    const signedUrlPairs = await Promise.all(
      attachments.map(async (attachment) => {
        const { data: signedData } = await supabase.storage
          .from(CHAT_FILES_BUCKET)
          .createSignedUrl(attachment.storage_path, 60 * 60);

        return [attachment.id, signedData?.signedUrl ?? ''] as const;
      }),
    );

    setAttachmentsByMessage(grouped);
    setAttachmentUrls(Object.fromEntries(signedUrlPairs));
  }, []);

  const fetchMessages = useCallback(async () => {
    if (!despachoId) return;

    setLoadingChat(true);
    const { data, error } = await supabase
      .from('despacho_chat_mensajes')
      .select('*')
      .eq('despacho_id', despachoId)
      .order('created_at', { ascending: false })
      .limit(80);

    if (error) {
      setErrorMessage(error.message);
      setLoadingChat(false);
      return;
    }

    const nextMessages = ((data ?? []) as ChatMessage[]).reverse();
    setMessages(nextMessages);
    await fetchAttachments(nextMessages.map((message) => message.id));
    setLoadingChat(false);
  }, [despachoId, fetchAttachments]);

  useEffect(() => {
    setMessages([]);
    setMembers([]);
    setAttachmentsByMessage({});
    setAttachmentUrls({});
    setErrorMessage('');
    setSelectedFile(null);
    if (!despachoId) return;

    fetchMembers();
    fetchMessages();
  }, [despachoId, fetchMembers, fetchMessages]);

  useEffect(() => {
    if (!despachoId) return;

    const channel = supabase
      .channel(`mobile-despacho-chat-${despachoId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'despacho_chat_mensajes', filter: `despacho_id=eq.${despachoId}` },
        () => {
          fetchMessages();
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'despacho_chat_adjuntos', filter: `despacho_id=eq.${despachoId}` },
        () => {
          fetchMessages();
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'despacho_miembros', filter: `despacho_id=eq.${despachoId}` },
        () => {
          fetchMembers();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [despachoId, fetchMembers, fetchMessages]);

  const handlePickFile = async () => {
    setErrorMessage('');

    const result = await DocumentPicker.getDocumentAsync({
      type: chatDocumentTypes,
      multiple: false,
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    const assetFile = typeof File !== 'undefined' && asset.file instanceof File ? asset.file : undefined;
    const size = asset.size ?? assetFile?.size ?? 0;
    const mimeType = getSupportedFileType(asset.name, asset.mimeType);

    if (!isAllowedChatFile(asset.name)) {
      setErrorMessage('Solo se permiten imagenes, PDF, Word .doc y Word .docx.');
      return;
    }

    if (size > MAX_CHAT_FILE_SIZE) {
      setErrorMessage('El archivo debe pesar 25 MB o menos.');
      return;
    }

    setSelectedFile({
      uri: asset.uri,
      name: asset.name,
      mimeType,
      size: size || 1,
      file: assetFile,
    });
  };

  const openAttachment = async (attachment: ChatAttachment) => {
    const signedUrl = attachmentUrls[attachment.id];
    if (!signedUrl) {
      setErrorMessage('No se pudo generar el enlace del archivo.');
      return;
    }

    await Linking.openURL(signedUrl);
  };

  const uploadAttachment = async (messageId: string, file: SelectedChatFile) => {
    const storagePath = `${despachoId}/chat/${messageId}/${Date.now()}-${safeFileName(file.name)}`;
    const uploadBody = file.file ?? (await fetch(file.uri).then((response) => response.arrayBuffer()));
    const fileSize = file.file?.size ?? (uploadBody instanceof ArrayBuffer ? uploadBody.byteLength : file.size);

    const { error: uploadError } = await supabase.storage
      .from(CHAT_FILES_BUCKET)
      .upload(storagePath, uploadBody, {
        contentType: file.mimeType,
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { error: attachmentError } = await supabase.from('despacho_chat_adjuntos').insert([
      {
        message_id: messageId,
        despacho_id: despachoId,
        storage_path: storagePath,
        file_name: file.name,
        file_type: file.mimeType,
        file_size: fileSize || file.size || 1,
        uploaded_by: currentUserId,
      },
    ]);

    if (attachmentError) throw attachmentError;
  };

  const sendMessage = async () => {
    const trimmedBody = body.trim();
    if (sending || !despachoId || (!trimmedBody && !selectedFile)) return;

    setSending(true);
    setErrorMessage('');

    const messageBody = trimmedBody || `Archivo adjunto: ${selectedFile?.name ?? 'archivo'}`;
    const { data, error } = await supabase
      .from('despacho_chat_mensajes')
      .insert([
        {
          despacho_id: despachoId,
          sender_user_id: currentUserId,
          body: messageBody,
        },
      ])
      .select('id')
      .single();

    if (error || !data?.id) {
      setErrorMessage(error?.message ?? 'No se pudo enviar el mensaje.');
      setSending(false);
      return;
    }

    const moderationDetection = detectModerationRisk(messageBody);
    if (moderationDetection) {
      void supabase.from('moderation_flags').insert([
        {
          despacho_id: despachoId,
          message_id: data.id as string,
          user_id: currentUserId,
          matched_category: moderationDetection.category,
          matched_terms: moderationDetection.terms,
          excerpt: messageBody.slice(0, 500),
        },
      ]);
    }

    if (selectedFile) {
      try {
        await uploadAttachment(data.id as string, selectedFile);
      } catch (uploadError) {
        setErrorMessage(uploadError instanceof Error ? uploadError.message : 'Mensaje enviado, pero no se adjunto el archivo.');
      }
    }

    setBody('');
    setSelectedFile(null);
    setSending(false);
    fetchMessages();
  };

  if (loadingMemberships) {
    return (
      <View style={styles.stack}>
        <ScreenHeader title="Chat de equipo" subtitle="Cargando despachos disponibles." />
        <View style={styles.emptyState}>
          <ActivityIndicator color="#1d4ed8" />
          <Text style={styles.emptyStateText}>Preparando chat del despacho...</Text>
        </View>
      </View>
    );
  }

  if (!selectedMembership) {
    return (
      <View style={styles.stack}>
        <ScreenHeader title="Chat de equipo" subtitle="Necesitas pertenecer a un despacho para usar el chat." />
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateTitle}>Sin despacho seleccionado</Text>
          <Text style={styles.emptyStateText}>
            Crea o unete a un despacho desde la app de escritorio para activar mensajes y archivos.
          </Text>
          {Boolean(membershipError) && <Text style={styles.inlineError}>{membershipError}</Text>}
        </View>
        <Pressable style={styles.secondaryAction} onPress={onRefreshMemberships}>
          <Text style={styles.secondaryActionText}>Actualizar despachos</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.stack}>
      <ScreenHeader
        title="Chat de equipo"
        subtitle={`Mensajes y archivos de ${getDespachoName(selectedMembership)}.`}
      />

      {memberships.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickLinksRow}>
          {memberships.map((membership) => {
            const active = membership.id === selectedMembership.id;
            return (
              <Pressable
                key={membership.id}
                style={[styles.deskChip, active && styles.deskChipActive]}
                onPress={() => onSelectMembership(membership)}
              >
                <Text style={[styles.deskChipText, active && styles.deskChipTextActive]}>{getDespachoName(membership)}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <View style={styles.teamChatHeader}>
        <TeamChatIcon />
        <View style={styles.teamCopy}>
          <Text style={styles.cardTitle}>{getDespachoName(selectedMembership)}</Text>
          <Text style={styles.cardText}>
            {members.length} colaborador(es) - {messages.length} mensaje(s)
          </Text>
        </View>
        <Pressable style={styles.iconButton} onPress={fetchMessages}>
          <Ionicons name="refresh-outline" size={18} color="#1d4ed8" />
        </Pressable>
      </View>

      {Boolean(errorMessage) && <Text style={styles.errorBox}>{errorMessage}</Text>}

      <View style={styles.chatMessagesCard}>
        {loadingChat ? (
          <View style={styles.emptyState}>
            <ActivityIndicator color="#1d4ed8" />
            <Text style={styles.emptyStateText}>Cargando mensajes...</Text>
          </View>
        ) : messages.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateTitle}>Todavia no hay mensajes</Text>
            <Text style={styles.emptyStateText}>Escribe o adjunta un archivo para iniciar la conversacion del despacho.</Text>
          </View>
        ) : (
          messages.map((message) => {
            const member = memberByUserId.get(message.sender_user_id);
            const isOwnMessage = message.sender_user_id === currentUserId;
            const attachments = attachmentsByMessage[message.id] ?? [];
            const memberColor = member?.profile_color || '#1d4ed8';

            return (
              <View key={message.id} style={[styles.messageRow, isOwnMessage && styles.messageRowOwn]}>
                <View style={[styles.messageAvatar, { backgroundColor: memberColor }]}>
                  <Text style={styles.messageAvatarText}>{getMemberDisplayName(member).slice(0, 1).toUpperCase()}</Text>
                </View>
                <View style={[styles.messageStack, isOwnMessage && styles.messageStackOwn]}>
                  <View style={[styles.messageMetaRow, isOwnMessage && styles.messageMetaRowOwn]}>
                    <Text style={[styles.messageName, { color: memberColor }]}>{getMemberDisplayName(member)}</Text>
                    <Text style={styles.messageRole}>{member ? roleLabels[member.role] : 'Colaborador'}</Text>
                  </View>
                  <Text style={styles.messageTime}>{formatMessageTime(message.created_at)}</Text>
                  <Text style={[styles.messageBubble, isOwnMessage && styles.messageBubbleOwn]}>{message.body}</Text>
                  {attachments.map((attachment) => (
                    <Pressable
                      key={attachment.id}
                      style={styles.attachmentRow}
                      onPress={() => openAttachment(attachment)}
                    >
                      <Ionicons
                        name={attachment.file_type.startsWith('image/') ? 'image-outline' : 'document-text-outline'}
                        size={18}
                        color="#1d4ed8"
                      />
                      <View style={styles.attachmentCopy}>
                        <Text style={styles.attachmentName}>{attachment.file_name}</Text>
                        <Text style={styles.attachmentSize}>{formatFileSize(attachment.file_size)}</Text>
                      </View>
                      <Ionicons name="open-outline" size={16} color="#64748b" />
                    </Pressable>
                  ))}
                </View>
              </View>
            );
          })
        )}
      </View>

      <View style={styles.chatComposer}>
        {selectedFile && (
          <View style={styles.selectedFileRow}>
            <Ionicons name="attach-outline" size={18} color="#1d4ed8" />
            <View style={styles.attachmentCopy}>
              <Text style={styles.attachmentName}>{selectedFile.name}</Text>
              <Text style={styles.attachmentSize}>{formatFileSize(selectedFile.size)}</Text>
            </View>
            <Pressable style={styles.iconButton} onPress={() => setSelectedFile(null)}>
              <Ionicons name="close-outline" size={18} color="#be123c" />
            </Pressable>
          </View>
        )}
        <TextInput
          multiline
          maxLength={2000}
          onChangeText={setBody}
          placeholder="Escribe un mensaje para el despacho..."
          placeholderTextColor="#94a3b8"
          style={styles.chatInput}
          value={body}
        />
        <View style={styles.chatActionsRow}>
          <Pressable style={styles.secondaryIconButton} onPress={handlePickFile}>
            <Ionicons name="attach-outline" size={20} color="#1d4ed8" />
          </Pressable>
          <Text style={styles.messageCounter}>{body.length}/2000</Text>
          <Pressable
            style={[styles.sendButton, (sending || (!body.trim() && !selectedFile)) && styles.sendButtonDisabled]}
            onPress={sendMessage}
            disabled={sending || (!body.trim() && !selectedFile)}
          >
            {sending ? <ActivityIndicator color="#ffffff" /> : <Ionicons name="send-outline" size={20} color="#ffffff" />}
          </Pressable>
        </View>
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
          <Text style={styles.kicker}>Centro interno</Text>
          <Text style={styles.screenTitle}>Ayuda del despacho</Text>
          <Text style={styles.screenSubtitle}>Accesos y pasos frecuentes para el trabajo diario.</Text>
        </View>
      </View>

      <View style={styles.chatCard}>
        <Text style={styles.botBubble}>
          Selecciona una opcion o escribe la tarea que necesitas ubicar dentro del despacho.
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
  selectedMembership,
  profileSettings,
  onProfileSettingsChange,
  onNavigate,
  onSignOut,
}: {
  email: string;
  selectedMembership: DespachoMember | null;
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
          <Text style={styles.cardText}>
            {selectedMembership ? roleLabels[selectedMembership.role] : profileSettings.roleLabel} - {email}
          </Text>
          {selectedMembership && <Text style={styles.cardText}>{getDespachoName(selectedMembership)}</Text>}
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
          <Text style={styles.primaryActionText}>Abrir centro premium</Text>
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
  textArea: {
    minHeight: 96,
    paddingTop: 12,
    textAlignVertical: 'top',
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
  deskChip: {
    minHeight: 38,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 6,
    paddingHorizontal: 12,
    backgroundColor: '#ffffff',
  },
  deskChipActive: {
    backgroundColor: '#1d4ed8',
    borderColor: '#1d4ed8',
  },
  deskChipText: {
    color: '#1d4ed8',
    fontSize: 13,
    fontWeight: '900',
  },
  deskChipTextActive: {
    color: '#ffffff',
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
  emptyState: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 6,
    padding: 14,
    backgroundColor: '#f8fafc',
  },
  emptyStateTitle: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '900',
  },
  emptyStateText: {
    marginTop: 5,
    color: '#64748b',
    fontSize: 13,
    lineHeight: 19,
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
  compactRowActive: {
    borderColor: '#1d4ed8',
    backgroundColor: '#eff6ff',
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
  optionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  optionCard: {
    width: '48%',
    minHeight: 104,
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#dbeafe',
    borderRadius: 6,
    padding: 13,
    backgroundColor: '#ffffff',
  },
  optionCardActive: {
    borderColor: '#1d4ed8',
    backgroundColor: '#1d4ed8',
  },
  optionTitle: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '900',
  },
  optionTitleActive: {
    color: '#ffffff',
  },
  optionMeta: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '800',
  },
  optionMetaActive: {
    color: '#dbeafe',
  },
  recordsStack: {
    gap: 10,
  },
  sectionMiniTitle: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '900',
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  choiceChip: {
    minHeight: 38,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 6,
    paddingHorizontal: 11,
    backgroundColor: '#ffffff',
  },
  choiceChipActive: {
    borderColor: '#1d4ed8',
    backgroundColor: '#1d4ed8',
  },
  choiceChipText: {
    color: '#1e40af',
    fontSize: 12,
    fontWeight: '900',
  },
  choiceChipTextActive: {
    color: '#ffffff',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  actionRowPrimary: {
    flex: 1,
  },
  secondaryActionCompact: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 6,
    paddingHorizontal: 12,
    backgroundColor: '#ffffff',
  },
  secondaryActionCompactText: {
    color: '#1d4ed8',
    fontSize: 13,
    fontWeight: '900',
  },
  recordCard: {
    borderWidth: 1,
    borderColor: '#dbeafe',
    borderRadius: 6,
    padding: 14,
    backgroundColor: '#ffffff',
  },
  recordMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  recordPill: {
    overflow: 'hidden',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    backgroundColor: '#eff6ff',
    color: '#1e40af',
    fontSize: 11,
    fontWeight: '900',
  },
  inlineFeedback: {
    marginTop: 10,
    color: '#1e40af',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  inlineError: {
    marginTop: 10,
    color: '#be123c',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
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
    alignItems: 'center',
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
  permissionCard: {
    minHeight: 88,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 6,
    padding: 14,
    backgroundColor: '#ffffff',
  },
  permissionCopy: {
    flex: 1,
  },
  smallPrimaryButton: {
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    paddingHorizontal: 13,
    backgroundColor: '#1d4ed8',
  },
  smallPrimaryButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
  },
  iconDangerButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#fecdd3',
    borderRadius: 6,
    backgroundColor: '#fff1f2',
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
  iconButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 6,
    backgroundColor: '#ffffff',
  },
  chatMessagesCard: {
    gap: 12,
    borderWidth: 1,
    borderColor: '#dbeafe',
    borderRadius: 6,
    padding: 12,
    backgroundColor: '#ffffff',
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
  },
  messageRowOwn: {
    flexDirection: 'row-reverse',
  },
  messageAvatar: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
  },
  messageAvatarText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
  },
  messageStack: {
    maxWidth: '84%',
    alignItems: 'flex-start',
  },
  messageStackOwn: {
    alignItems: 'flex-end',
  },
  messageMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  messageMetaRowOwn: {
    justifyContent: 'flex-end',
  },
  messageName: {
    fontSize: 13,
    fontWeight: '900',
  },
  messageRole: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '800',
  },
  messageTime: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 2,
    marginBottom: 4,
  },
  messageBubble: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#f8fafc',
    color: '#0f172a',
    fontSize: 14,
    lineHeight: 20,
  },
  messageBubbleOwn: {
    borderColor: '#1d4ed8',
    backgroundColor: '#1d4ed8',
    color: '#ffffff',
  },
  attachmentRow: {
    width: '100%',
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 6,
    marginTop: 7,
    paddingHorizontal: 10,
    backgroundColor: '#eff6ff',
  },
  attachmentCopy: {
    flex: 1,
    minWidth: 0,
  },
  attachmentName: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '900',
  },
  attachmentSize: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 2,
  },
  chatComposer: {
    gap: 10,
    borderWidth: 1,
    borderColor: '#dbeafe',
    borderRadius: 6,
    padding: 12,
    backgroundColor: '#ffffff',
  },
  selectedFileRow: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 6,
    paddingHorizontal: 10,
    backgroundColor: '#eff6ff',
  },
  chatInput: {
    minHeight: 84,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
    color: '#0f172a',
    fontSize: 15,
    textAlignVertical: 'top',
  },
  chatActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  secondaryIconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 6,
    backgroundColor: '#ffffff',
  },
  messageCounter: {
    flex: 1,
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '800',
  },
  sendButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    backgroundColor: '#1d4ed8',
  },
  sendButtonDisabled: {
    opacity: 0.45,
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
