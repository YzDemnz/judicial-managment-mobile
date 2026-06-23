import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as Calendar from 'expo-calendar';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as LocalAuthentication from 'expo-local-authentication';
import { useNetworkState } from 'expo-network';
import * as Notifications from 'expo-notifications';
import * as Sharing from 'expo-sharing';
import type { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
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
import {
  checkForMobileUpdate,
  currentMobileBuild,
  currentMobileVersion,
  openMobileUpdate,
  type MobileReleaseManifest,
} from './src/lib/appUpdates';
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
  | 'despachos'
  | 'more'
  | 'configuracion';

type QuickAction = 'expediente' | 'movimiento' | 'audiencia' | 'cliente' | 'scan';

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
  description?: string;
  dateInput: string;
  timeInput: string;
  eventAt: string;
  notificationIds: string[];
  createdAt: string;
  expedienteId?: string | null;
  movimientoId?: string | null;
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

interface MobileCliente {
  id: string;
  nombre: string;
  monto_pactado: number;
  total_adeudo: number;
  despacho_id?: string | null;
  created_at: string;
}

type LaboralSeccion = 'conciliacion' | 'junta_local' | 'tribunal_laboral';
type LaboralProcedimiento = 'normal' | 'especial';

interface MobileLaboralAsunto {
  id: string;
  despacho_id: string;
  seccion: LaboralSeccion;
  numero_expediente?: string | null;
  partes: string;
  procedimiento?: LaboralProcedimiento | null;
  fecha_conciliacion?: string | null;
  hoja_conciliacion?: boolean | null;
  estatus: string;
  notas: string;
  created_at: string;
  updated_at: string;
}

interface AppProfile {
  id: string;
  email?: string | null;
  account_status?: 'active' | 'disabled' | 'banned';
  subscription_status?: 'trial' | 'active' | 'past_due' | 'canceled' | 'manual';
  ban_until?: string | null;
  ban_reason?: string | null;
  disabled_reason?: string | null;
  trial_ends_at?: string | null;
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

interface MobileDocumentAttachment {
  id: string;
  target_type: 'expediente' | 'movimiento';
  expediente_id?: string | null;
  movimiento_id?: string | null;
  storage_path: string;
  file_name: string;
  file_type: string;
  file_size: number;
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
const BIOMETRIC_LOCK_STORAGE_KEY = 'judicial-mobile-biometric-lock';
const SELECTED_DESPACHO_STORAGE_KEY = 'judicial-mobile-selected-despacho';
const NOTIFICATION_CHANNEL_ID = 'audiencias';
const CHAT_FILES_BUCKET = 'despacho-chat-files';
const DOCUMENT_FILES_BUCKET = 'despacho-document-files';
const MAX_CHAT_FILE_SIZE = 25 * 1024 * 1024;
const UPDATE_PROMPT_STORAGE_KEY = 'judicial-mobile-last-update-prompt';
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

const navigation: Array<{ id: Section; name: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { id: 'dashboard', name: 'Inicio', icon: 'home-outline' },
  { id: 'expedientes', name: 'Expedientes', icon: 'folder-open-outline' },
  { id: 'calendario', name: 'Agenda', icon: 'calendar-outline' },
  { id: 'teamChat', name: 'Chat', icon: 'chatbubbles-outline' },
  { id: 'more', name: 'Mas', icon: 'grid-outline' },
];

const quickLinks = [
  { label: 'PJF', name: 'Poder Judicial de la Federacion', url: 'https://www.pjf.gob.mx/' },
  { label: 'Poder en Linea', name: 'Poder Judicial de Coahuila', url: 'https://poderenlinea.gob.mx/' },
  { label: 'SCJN', name: 'Suprema Corte de Justicia de la Nacion', url: 'https://www.scjn.gob.mx/' },
];

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

const getAudienceRecommendation = (isoDate: string) => {
  const eventDate = new Date(isoDate);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startEvent = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
  const days = Math.round((startEvent.getTime() - startToday.getTime()) / (24 * 60 * 60 * 1000));
  const time = new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit' }).format(eventDate);

  if (days === 0) return `Es hoy a las ${time}. Confirma documentos y traslado.`;
  if (days === 1) return `Es manana a las ${time}. Revisa el expediente hoy.`;
  if (days > 1 && days <= 3) return `Faltan ${days} dias. Prepara promociones, pruebas y documentos.`;
  if (days > 3 && days <= 7) return `Esta semana, en ${days} dias. Verifica pendientes.`;
  if (days > 7) return `Faltan ${days} dias.`;
  return `La audiencia estaba programada para ${formatCalendarDate(isoDate)}.`;
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

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);

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

const pickCameraImage = async () => {
  if (Platform.OS === 'web') {
    return { file: null, error: 'La camara esta disponible en la app instalada.' };
  }

  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    return { file: null, error: 'Autoriza el uso de la camara para digitalizar documentos.' };
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 0.82,
    allowsEditing: false,
  });

  if (result.canceled || !result.assets?.[0]) return { file: null, error: '' };

  const asset = result.assets[0];
  const extension = asset.fileName ? getFileExtension(asset.fileName) : 'jpg';
  const name = asset.fileName || `documento-${Date.now()}.${extension || 'jpg'}`;
  const mimeType = asset.mimeType || 'image/jpeg';

  return {
    file: {
      uri: asset.uri,
      name,
      mimeType,
      size: asset.fileSize || 1,
    } satisfies SelectedChatFile,
    error: '',
  };
};

const toDatabaseDateFromDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toTimeInputValue = (date: Date) => {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

const fromDatabaseCalendarEvent = (
  row: {
    id: string;
    titulo: string;
    descripcion?: string | null;
    event_date: string;
    event_time?: string | null;
    expediente_id?: string | null;
    movimiento_id?: string | null;
    created_at: string;
  },
  localNotificationIds: string[] = [],
): CalendarEvent => {
  const timeInput = (row.event_time || '09:00').slice(0, 5);
  const dateInput = toMexicanDateFromDatabase(row.event_date);
  const eventDate = parseCalendarDate(dateInput, timeInput) ?? new Date(`${row.event_date}T${timeInput}:00`);

  return {
    id: row.id,
    title: row.titulo,
    description: row.descripcion || '',
    dateInput,
    timeInput,
    eventAt: eventDate.toISOString(),
    notificationIds: localNotificationIds,
    createdAt: row.created_at,
    expedienteId: row.expediente_id,
    movimientoId: row.movimiento_id,
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

const shareRemoteFile = async (url: string, fileName: string, mimeType: string) => {
  if (Platform.OS === 'web') {
    await Linking.openURL(url);
    return;
  }

  const available = await Sharing.isAvailableAsync();
  if (!available) {
    await Linking.openURL(url);
    return;
  }

  const destination = new File(Paths.cache, `${Date.now()}-${safeFileName(fileName)}`);
  const downloadedFile = await File.downloadFileAsync(url, destination);
  await Sharing.shareAsync(downloadedFile.uri, {
    mimeType,
    dialogTitle: `Compartir ${fileName}`,
    UTI: mimeType,
  });
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
  const networkState = useNetworkState();
  const [session, setSession] = useState<Session | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [activeSection, setActiveSection] = useState<Section>('dashboard');
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
  const [availableUpdate, setAvailableUpdate] = useState<MobileReleaseManifest | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateMessage, setUpdateMessage] = useState('');
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);
  const [despachoPickerOpen, setDespachoPickerOpen] = useState(false);
  const [quickAction, setQuickAction] = useState<{ type: QuickAction; nonce: number } | null>(null);
  const [appProfile, setAppProfile] = useState<AppProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricLocked, setBiometricLocked] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);

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
    if (Platform.OS === 'web') {
      setNotificationStatus('unsupported');
      return;
    }

    void Notifications.getPermissionsAsync().then((permission) => {
      setNotificationStatus(permission.status === 'granted' ? 'granted' : 'unknown');
    });
  }, []);

  const unlockWithBiometrics = useCallback(async () => {
    if (Platform.OS === 'web') {
      setBiometricLocked(false);
      return true;
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Desbloquear Judicial Managment',
      cancelLabel: 'Cancelar',
      fallbackLabel: 'Usar bloqueo del dispositivo',
      disableDeviceFallback: false,
    });

    if (result.success) {
      setBiometricLocked(false);
      return true;
    }

    return false;
  }, []);

  useEffect(() => {
    let mounted = true;

    Promise.all([
      AsyncStorage.getItem(BIOMETRIC_LOCK_STORAGE_KEY),
      Platform.OS === 'web' ? Promise.resolve(false) : LocalAuthentication.hasHardwareAsync(),
      Platform.OS === 'web' ? Promise.resolve(false) : LocalAuthentication.isEnrolledAsync(),
    ])
      .then(([savedPreference, hasHardware, isEnrolled]) => {
        if (!mounted) return;
        const available = Boolean(hasHardware && isEnrolled);
        const enabled = savedPreference === 'true' && available;
        setBiometricAvailable(available);
        setBiometricEnabled(enabled);
        setBiometricLocked(Boolean(session && enabled));
      })
      .catch(() => undefined);

    return () => {
      mounted = false;
    };
  }, [session?.user.id]);

  useEffect(() => {
    if (Platform.OS === 'web' || !biometricEnabled || !session) return undefined;

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background' || nextState === 'inactive') {
        setBiometricLocked(true);
      }
    });

    return () => subscription.remove();
  }, [biometricEnabled, session]);

  useEffect(() => {
    if (!session?.user.id) {
      setAppProfile(null);
      return;
    }

    let mounted = true;
    setLoadingProfile(true);

    void (async () => {
      try {
        const { data } = await supabase
          .from('app_profiles')
          .select('id,email,account_status,subscription_status,ban_until,ban_reason,disabled_reason,trial_ends_at')
          .eq('id', session.user.id)
          .maybeSingle();
        if (!mounted) return;
        setAppProfile((data as AppProfile | null) ?? null);
      } finally {
        if (mounted) setLoadingProfile(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [session?.user.id]);

  const installAvailableUpdate = useCallback(async (release: MobileReleaseManifest | null) => {
    if (!release) return;

    try {
      await openMobileUpdate(release);
    } catch (updateError) {
      Alert.alert(
        'No se pudo abrir la descarga',
        updateError instanceof Error ? updateError.message : 'Intenta nuevamente desde Configuracion.',
      );
    }
  }, []);

  const checkForUpdates = useCallback(async (manual = false) => {
    if (Platform.OS !== 'android') {
      if (manual) {
        Alert.alert('Actualizaciones', 'La comprobacion automatica se habilita en la app Android instalada.');
      }
      return;
    }

    setCheckingUpdate(true);
    setUpdateMessage('');

    try {
      const result = await checkForMobileUpdate();
      if (result.updateAvailable && result.release) {
        const release = result.release;
        setAvailableUpdate(release);
        setUpdateMessage(`La version ${release.version} esta lista para instalar.`);

        const lastPrompt = await AsyncStorage.getItem(UPDATE_PROMPT_STORAGE_KEY);
        const promptKey = `${release.version}:${new Date().toISOString().slice(0, 10)}`;
        if (manual || lastPrompt !== promptKey) {
          await AsyncStorage.setItem(UPDATE_PROMPT_STORAGE_KEY, promptKey);
          const releaseNotes = release.notes.slice(0, 3).join('\n');
          Alert.alert(
            `Actualizacion ${release.version} disponible`,
            `${releaseNotes}\n\nAndroid te pedira confirmar la instalacion.`,
            [
              { text: 'Mas tarde', style: 'cancel' },
              { text: 'Descargar', onPress: () => void installAvailableUpdate(release) },
            ],
          );
        }
        return;
      }

      setAvailableUpdate(null);
      setUpdateMessage(`Tienes la version mas reciente (${result.currentVersion}).`);
      if (manual) {
        Alert.alert('Aplicacion actualizada', `Ya tienes la version ${result.currentVersion}.`);
      }
    } catch (updateError) {
      const nextMessage =
        updateError instanceof Error ? updateError.message : 'No se pudo comprobar la actualizacion.';
      setUpdateMessage(nextMessage);
      if (manual) {
        Alert.alert('No se pudo comprobar', `${nextMessage}\n\nRevisa tu conexion e intenta nuevamente.`);
      }
    } finally {
      setCheckingUpdate(false);
    }
  }, [installAvailableUpdate]);

  useEffect(() => {
    void checkForUpdates(false);
    const intervalId = setInterval(() => {
      void checkForUpdates(false);
    }, UPDATE_CHECK_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [checkForUpdates]);

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
    const savedDespachoId = await AsyncStorage.getItem(SELECTED_DESPACHO_STORAGE_KEY).catch(() => null);
    setMemberships(activeMemberships);
    setSelectedMembership((current) => {
      if (current && activeMemberships.some((membership) => membership.id === current.id)) return current;
      if (savedDespachoId) {
        const savedMembership = activeMemberships.find((membership) => membership.despacho_id === savedDespachoId);
        if (savedMembership) return savedMembership;
      }
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

  const selectMembership = useCallback((membership: DespachoMember) => {
    setSelectedMembership(membership);
    void AsyncStorage.setItem(SELECTED_DESPACHO_STORAGE_KEY, membership.despacho_id);
  }, []);

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
    const despachoId = selectedMembership?.despacho_id;
    if (!despachoId) {
      setCalendarEvents([]);
      return undefined;
    }

    let mounted = true;

    const fetchCalendarEvents = async () => {
      const savedEvents = await AsyncStorage.getItem(CALENDAR_EVENTS_STORAGE_KEY).catch(() => null);
      const localEvents = savedEvents ? (JSON.parse(savedEvents) as CalendarEvent[]) : [];
      const localNotifications = new Map(localEvents.map((event) => [event.id, event.notificationIds]));
      const { data, error: calendarError } = await supabase
        .from('calendario_eventos')
        .select('id,titulo,descripcion,event_date,event_time,expediente_id,movimiento_id,created_at')
        .eq('despacho_id', despachoId)
        .order('event_date', { ascending: true })
        .order('event_time', { ascending: true });

      if (!mounted || calendarError) return;
      const nextEvents = (data ?? []).map((row) =>
        fromDatabaseCalendarEvent(row, localNotifications.get(row.id as string) ?? []),
      );
      saveCalendarEvents(nextEvents);
    };

    void fetchCalendarEvents();

    const channel = supabase
      .channel(`mobile-calendar-${despachoId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'calendario_eventos', filter: `despacho_id=eq.${despachoId}` },
        () => void fetchCalendarEvents(),
      )
      .subscribe();

    return () => {
      mounted = false;
      void supabase.removeChannel(channel);
    };
  }, [selectedMembership?.despacho_id]);

  useEffect(() => {
    if (Platform.OS === 'web') return undefined;

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.type === 'calendar-event') {
        setActiveSection('calendario');
      }
    });

    return () => subscription.remove();
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

  const scheduleCalendarNotifications = async (title: string, eventDate: Date, eventId?: string) => {
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
          data: { type: 'calendar-event', title, eventAt: eventDate.toISOString(), eventId },
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

  const createCalendarEvent = async (
    title: string,
    dateInput: string,
    timeInput: string,
    options?: {
      description?: string;
      expedienteId?: string | null;
      movimientoId?: string | null;
      tipo?: 'audiencia' | 'vencimiento' | 'recordatorio' | 'otro';
    },
  ) => {
    const despachoId = selectedMembership?.despacho_id;
    if (!despachoId) {
      return { ok: false, message: 'Selecciona un despacho para guardar la audiencia.' };
    }

    if (!canEditMembership(selectedMembership)) {
      return { ok: false, message: 'Tu acceso es de solo lectura.' };
    }

    const cleanTitle = title.trim() || 'Audiencia';
    const eventDate = parseCalendarDate(dateInput, timeInput);

    if (!eventDate) {
      return { ok: false, message: 'Usa fecha 00/00/0000 y hora 00:00.' };
    }

    if (eventDate.getTime() <= Date.now()) {
      return { ok: false, message: 'La fecha debe ser futura para poder programar avisos.' };
    }

    const { data, error: insertError } = await supabase
      .from('calendario_eventos')
      .insert([
        {
          despacho_id: despachoId,
          expediente_id: options?.expedienteId ?? null,
          movimiento_id: options?.movimientoId ?? null,
          titulo: cleanTitle,
          descripcion: options?.description?.trim() || '',
          event_date: toDatabaseDateFromDate(eventDate),
          event_time: `${toTimeInputValue(eventDate)}:00`,
          tipo: options?.tipo ?? 'audiencia',
          notify_day_before: true,
          notify_same_day: true,
        },
      ])
      .select('id,titulo,descripcion,event_date,event_time,expediente_id,movimiento_id,created_at')
      .single();

    if (insertError || !data?.id) {
      return { ok: false, message: insertError?.message ?? 'No se pudo guardar la audiencia.' };
    }

    const notificationIds = await scheduleCalendarNotifications(cleanTitle, eventDate, data.id as string);
    const nextEvent: CalendarEvent = {
      id: data.id as string,
      title: cleanTitle,
      description: options?.description?.trim() || '',
      dateInput: dateInput.trim(),
      timeInput: timeInput.trim() || '09:00',
      eventAt: eventDate.toISOString(),
      notificationIds,
      createdAt: data.created_at as string,
      expedienteId: options?.expedienteId ?? null,
      movimientoId: options?.movimientoId ?? null,
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

    const { error: deleteError } = await supabase.from('calendario_eventos').delete().eq('id', eventId);
    if (deleteError) {
      Alert.alert('No se pudo eliminar', deleteError.message);
      return;
    }

    saveCalendarEvents(calendarEvents.filter((item) => item.id !== eventId));
  };

  const addEventToDeviceCalendar = async (event: CalendarEvent) => {
    if (Platform.OS === 'web') {
      Alert.alert('Calendario del dispositivo', 'Esta opcion esta disponible en la app instalada.');
      return;
    }

    const permission = await Calendar.requestCalendarPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permiso necesario', 'Autoriza el calendario para copiar esta audiencia al dispositivo.');
      return;
    }

    try {
      await Calendar.createEventInCalendarAsync({
        title: event.title,
        notes: event.description || 'Audiencia registrada en Judicial Managment',
        startDate: new Date(event.eventAt),
        endDate: new Date(new Date(event.eventAt).getTime() + 60 * 60 * 1000),
        alarms: [{ relativeOffset: -24 * 60 }, { relativeOffset: 0 }],
      });
    } catch (calendarError) {
      Alert.alert(
        'No se pudo abrir el calendario',
        calendarError instanceof Error ? calendarError.message : 'Intenta nuevamente.',
      );
    }
  };

  const setBiometricPreference = async (enabled: boolean) => {
    if (enabled && !biometricAvailable) {
      Alert.alert(
        'Biometria no disponible',
        'Configura huella o reconocimiento facial en el telefono antes de activar esta proteccion.',
      );
      return;
    }

    if (enabled) {
      const unlocked = await unlockWithBiometrics();
      if (!unlocked) return;
    }

    setBiometricEnabled(enabled);
    setBiometricLocked(false);
    await AsyncStorage.setItem(BIOMETRIC_LOCK_STORAGE_KEY, String(enabled));
  };

  const openQuickAction = (type: QuickAction) => {
    setQuickActionsOpen(false);
    const nextAction = { type, nonce: Date.now() };
    setQuickAction(nextAction);

    if (type === 'expediente' || type === 'scan') setActiveSection('expedientes');
    if (type === 'movimiento' || type === 'audiencia') setActiveSection('movimientos');
    if (type === 'cliente') setActiveSection('clientes');

    setTimeout(() => {
      setQuickAction((current) => (current?.nonce === nextAction.nonce ? null : current));
    }, 1800);
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

  const handlePasswordRecovery = async () => {
    setError('');
    setMessage('');
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setError('Escribe tu correo para solicitar la recuperación de contraseña.');
      return;
    }

    setAuthLoading(true);
    try {
      const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: PORTAL_CONFIRM_URL,
      });
      if (recoveryError) throw recoveryError;
      setMessage('Te enviamos un enlace seguro para restablecer tu contraseña.');
    } catch (recoveryError) {
      setError(recoveryError instanceof Error ? recoveryError.message : 'No se pudo solicitar la recuperación.');
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
      <LinearGradient colors={['#071526', '#0b2a62', '#dce9ff']} style={styles.authScreen}>
        <StatusBar style="light" />
        <View pointerEvents="none" style={styles.authHaloTop} />
        <View pointerEvents="none" style={styles.authHaloBottom} />
        <SafeAreaView style={styles.safeArea}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboardArea}>
            <ScrollView contentContainerStyle={styles.authModernContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={styles.authModernShell}>
                <View style={styles.authModernBrand}>
                  <View style={styles.authBrandMark}><Image source={logo} style={styles.authModernLogo} /></View>
                  <View>
                    <Text style={styles.authBrandName}>Judicial Managment</Text>
                    <Text style={styles.authBrandCaption}>MR Legal</Text>
                  </View>
                </View>

                <View style={styles.authModernIntro}>
                  <View style={styles.authEyebrow}><Ionicons name="shield-checkmark-outline" size={14} color="#d4ab4e" /><Text style={styles.authEyebrowText}>ACCESO PROTEGIDO</Text></View>
                  <Text style={styles.authModernTitle}>{mode === 'login' ? 'Bienvenido de nuevo' : 'Tu despacho empieza aquí'}</Text>
                  <Text style={styles.authModernSubtitle}>{mode === 'login' ? 'Inicia sesión para continuar con tu trabajo jurídico.' : 'Crea una cuenta para organizar expedientes y colaborar.'}</Text>
                </View>

                <View style={styles.authModernCard}>
                  {Boolean(error) && <View style={styles.authErrorNotice}><Ionicons name="alert-circle-outline" size={18} color="#b91c1c" /><Text style={styles.authErrorText}>{error}</Text></View>}
                  {Boolean(message) && <View style={styles.authSuccessNotice}><Ionicons name="mail-outline" size={18} color="#1d4ed8" /><Text style={styles.authSuccessText}>{message}</Text></View>}

                  <Text style={styles.authFormTitle}>{mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}</Text>
                  <Text style={styles.authFormHint}>{mode === 'login' ? 'Usa tus credenciales de Judicial Managment.' : 'Tu correo será la llave de acceso a tu despacho.'}</Text>

                  <Text style={styles.authModernLabel}>Correo electrónico</Text>
                  <View style={styles.authInputShell}>
                    <Ionicons name="mail-outline" size={20} color="#2563eb" />
                    <TextInput
                      autoCapitalize="none"
                      autoComplete="email"
                      keyboardType="email-address"
                      onChangeText={setEmail}
                      placeholder="tu@correo.com"
                      placeholderTextColor="#94a3b8"
                      style={styles.authModernInput}
                      value={email}
                    />
                  </View>

                  <Text style={styles.authModernLabel}>Contraseña</Text>
                  <View style={styles.authInputShell}>
                    <Ionicons name="lock-closed-outline" size={19} color="#2563eb" />
                    <TextInput
                      autoCapitalize="none"
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                      onChangeText={setPassword}
                      placeholder="Mínimo 6 caracteres"
                      placeholderTextColor="#94a3b8"
                      secureTextEntry={!showPassword}
                      style={styles.authModernInput}
                      value={password}
                    />
                    <Pressable onPress={() => setShowPassword((current) => !current)} hitSlop={10}>
                      <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#64748b" />
                    </Pressable>
                  </View>

                  {mode === 'login' && <Pressable onPress={handlePasswordRecovery} disabled={authLoading} style={styles.authRecoveryLink}><Text style={styles.authRecoveryText}>¿Olvidaste tu contraseña?</Text></Pressable>}

                  <Pressable style={({ pressed }) => [styles.authModernPrimary, pressed && styles.authModernPrimaryPressed, authLoading && styles.authModernDisabled]} onPress={handleAuth} disabled={authLoading}>
                    {authLoading ? <ActivityIndicator color="#ffffff" /> : <><Text style={styles.authModernPrimaryText}>{mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}</Text><Ionicons name="arrow-forward" size={19} color="#ffffff" /></>}
                  </Pressable>

                  <View style={styles.authModernDivider}><View style={styles.authModernDividerLine} /><Text style={styles.authModernDividerText}>o continúa desde el portal</Text><View style={styles.authModernDividerLine} /></View>

                  <Pressable style={({ pressed }) => [styles.authPortalButton, pressed && styles.authPortalButtonPressed]} onPress={() => Linking.openURL(PORTAL_URL)}>
                    <Ionicons name="globe-outline" size={18} color="#1d4ed8" />
                    <Text style={styles.authPortalButtonText}>Abrir portal web</Text>
                    <Ionicons name="open-outline" size={16} color="#1d4ed8" />
                  </Pressable>

                  <View style={styles.authSwitchRow}>
                    <Text style={styles.authSwitchText}>{mode === 'login' ? '¿Aún no tienes cuenta?' : '¿Ya tienes una cuenta?'}</Text>
                    <Pressable onPress={() => { setError(''); setMessage(''); setPassword(''); setMode((current) => current === 'login' ? 'signup' : 'login'); }}><Text style={styles.authSwitchLink}>{mode === 'login' ? 'Regístrate' : 'Inicia sesión'}</Text></Pressable>
                  </View>
                </View>

                <View style={styles.authTrustRow}><Ionicons name="lock-closed-outline" size={15} color="#d4ab4e" /><Text style={styles.authTrustText}>Tu información se administra en tu cuenta y despacho.</Text></View>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  if (loadingProfile) {
    return (
      <View style={styles.loadingPlainScreen}>
        <Image source={logo} style={styles.loadingLogo} />
        <ActivityIndicator color="#1d4ed8" size="large" />
        <Text style={styles.loadingPlainText}>Validando tu cuenta</Text>
      </View>
    );
  }

  if (appProfile?.account_status === 'disabled' || appProfile?.account_status === 'banned') {
    const banned = appProfile.account_status === 'banned';
    return (
      <View style={styles.blockedScreen}>
        <Image source={logo} style={styles.loadingLogo} />
        <Ionicons name={banned ? 'shield-outline' : 'pause-circle-outline'} size={52} color="#be123c" />
        <Text style={styles.blockedTitle}>{banned ? 'Cuenta en revision' : 'Cuenta desactivada temporalmente'}</Text>
        <Text style={styles.blockedText}>
          {banned
            ? appProfile.ban_reason || 'Detectamos una posible infraccion y el acceso esta suspendido mientras revisamos la cuenta.'
            : appProfile.disabled_reason || 'La cuenta sera reactivada cuando termine la validacion de su informacion.'}
        </Text>
        {banned && appProfile.ban_until && (
          <Text style={styles.blockedMeta}>Revision programada hasta {formatMessageTime(appProfile.ban_until)}</Text>
        )}
        <Pressable style={styles.secondaryAction} onPress={handleSignOut}>
          <Text style={styles.secondaryActionText}>Cerrar sesion</Text>
        </Pressable>
      </View>
    );
  }

  if (biometricLocked) {
    return (
      <LinearGradient colors={['#020617', '#0f172a']} style={styles.biometricScreen}>
        <Image source={logo} style={styles.loadingLogo} />
        <Text style={styles.biometricTitle}>Judicial Managment bloqueado</Text>
        <Text style={styles.biometricText}>Confirma tu identidad para consultar los datos del despacho.</Text>
        <Pressable style={styles.biometricButton} onPress={() => void unlockWithBiometrics()}>
          <Ionicons name="finger-print-outline" size={24} color="#0c1424" />
          <Text style={styles.biometricButtonText}>Desbloquear</Text>
        </Pressable>
        <StatusBar style="light" />
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
            <Pressable
              style={[styles.headerAvatar, { backgroundColor: profileSettings.accentColor }]}
              onPress={() => setActiveSection('configuracion')}
            >
              <Text style={styles.headerAvatarText}>{profileSettings.profileInitial.slice(0, 1).toUpperCase()}</Text>
            </Pressable>
          </View>

          <Pressable
            style={styles.despachoSelector}
            onPress={() => setDespachoPickerOpen(true)}
          >
            <View style={styles.despachoSelectorIcon}>
              <Ionicons name="briefcase-outline" size={17} color="#d4ab4e" />
            </View>
            <View style={styles.despachoSelectorCopy}>
              <Text style={styles.despachoSelectorLabel}>Despacho activo</Text>
              <Text numberOfLines={1} style={styles.despachoSelectorName}>
                {selectedMembership ? getDespachoName(selectedMembership) : 'Seleccionar despacho'}
              </Text>
            </View>
            <Ionicons name="chevron-down" size={18} color="#cbd5e1" />
          </Pressable>
        </SafeAreaView>
      </LinearGradient>

      {networkState.isConnected === false && (
        <View style={styles.offlineBanner}>
          <Ionicons name="cloud-offline-outline" size={18} color="#7f1d1d" />
          <Text style={styles.offlineBannerText}>Sin conexion. Puedes consultar la pantalla, pero los cambios no se guardaran.</Text>
        </View>
      )}

      {availableUpdate && (
        <View style={styles.updateBanner}>
          <View style={styles.updateBannerIcon}>
            <Ionicons name="cloud-download-outline" size={21} color="#f8fafc" />
          </View>
          <View style={styles.updateBannerCopy}>
            <Text style={styles.updateBannerTitle}>Version {availableUpdate.version} disponible</Text>
            <Text style={styles.updateBannerText}>Descarga la mejora y confirma la instalacion en Android.</Text>
          </View>
          <Pressable style={styles.updateBannerButton} onPress={() => void installAvailableUpdate(availableUpdate)}>
            <Text style={styles.updateBannerButtonText}>Instalar</Text>
          </Pressable>
        </View>
      )}

      <ScrollView
        key={`${activeSection}-${selectedMembership?.despacho_id ?? 'none'}`}
        style={styles.content}
        contentContainerStyle={styles.contentInner}
        keyboardShouldPersistTaps="handled"
      >
        {activeSection === 'dashboard' && (
          <DashboardScreen
            selectedMembership={selectedMembership}
            onNavigate={setActiveSection}
            onQuickAction={() => setQuickActionsOpen(true)}
          />
        )}
        {activeSection === 'totalExpedientes' && (
          <TotalExpedientesScreen selectedMembership={selectedMembership} onNavigate={setActiveSection} />
        )}
        {activeSection === 'expedientes' && (
          <ExpedientesScreen
            selectedMembership={selectedMembership}
            currentUserId={session.user.id}
            quickAction={quickAction}
          />
        )}
        {activeSection === 'archivo' && (
          <ArchivoScreen selectedMembership={selectedMembership} onNavigate={setActiveSection} />
        )}
        {activeSection === 'movimientos' && (
          <MovimientosScreen
            selectedMembership={selectedMembership}
            currentUserId={session.user.id}
            onCreateCalendarEvent={createCalendarEvent}
            quickAction={quickAction}
          />
        )}
        {activeSection === 'calendario' && (
          <CalendarioScreen
            events={calendarEvents}
            notificationStatus={notificationStatus}
            onCreateCalendarEvent={createCalendarEvent}
            onDeleteCalendarEvent={deleteCalendarEvent}
            onRequestPermission={requestNotificationPermission}
            onAddToDeviceCalendar={addEventToDeviceCalendar}
          />
        )}
        {activeSection === 'clientes' && (
          <ClientesScreen selectedMembership={selectedMembership} quickAction={quickAction} />
        )}
        {activeSection === 'laboral' && <LaboralScreen selectedMembership={selectedMembership} />}
        {activeSection === 'teamChat' && (
          <TeamChatScreen
            currentUserId={session.user.id}
            memberships={memberships}
            selectedMembership={selectedMembership}
            loadingMemberships={loadingMemberships}
            membershipError={membershipError}
            onRefreshMemberships={fetchMemberships}
            onSelectMembership={selectMembership}
          />
        )}
        {activeSection === 'despachos' && (
          <DespachosScreen
            memberships={memberships}
            selectedMembership={selectedMembership}
            onRefresh={fetchMemberships}
            onSelect={selectMembership}
          />
        )}
        {activeSection === 'more' && <MoreScreen onNavigate={setActiveSection} />}
        {activeSection === 'configuracion' && (
          <ConfiguracionScreen
            email={displayEmail}
            selectedMembership={selectedMembership}
            profileSettings={profileSettings}
            onProfileSettingsChange={updateProfileSettings}
            onNavigate={setActiveSection}
            onSignOut={handleSignOut}
            appVersion={currentMobileVersion}
            appBuild={currentMobileBuild}
            availableUpdate={availableUpdate}
            checkingUpdate={checkingUpdate}
            updateMessage={updateMessage}
            onCheckForUpdates={() => checkForUpdates(true)}
            onInstallUpdate={() => installAvailableUpdate(availableUpdate)}
            biometricAvailable={biometricAvailable}
            biometricEnabled={biometricEnabled}
            onBiometricChange={setBiometricPreference}
            subscriptionStatus={appProfile?.subscription_status}
            trialEndsAt={appProfile?.trial_ends_at}
          />
        )}
      </ScrollView>

      <View style={styles.bottomBar}>
        {navigation.map((item, index) => {
          const active =
            item.id === activeSection ||
            (item.id === 'more' &&
              ['movimientos', 'clientes', 'laboral', 'archivo', 'totalExpedientes', 'despachos', 'configuracion'].includes(activeSection));
          const middle = index === 2;
          return (
            <View key={item.id} style={styles.bottomItemSlot}>
              {middle && (
                <Pressable
                  accessibilityLabel="Abrir acciones rapidas"
                  style={styles.quickActionButton}
                  onPress={() => setQuickActionsOpen(true)}
                >
                  <Ionicons name="add" size={30} color="#0c1424" />
                </Pressable>
              )}
              <Pressable
                style={[styles.bottomItem, middle && styles.bottomItemMiddle, active && styles.bottomItemActive]}
                onPress={() => setActiveSection(item.id)}
              >
                <Ionicons name={item.icon} size={21} color={active ? '#1d4ed8' : '#64748b'} />
                <Text style={[styles.bottomItemText, active && styles.bottomItemTextActive]}>{item.name}</Text>
              </Pressable>
            </View>
          );
        })}
      </View>

      <QuickActionsModal
        visible={quickActionsOpen}
        onClose={() => setQuickActionsOpen(false)}
        onSelect={openQuickAction}
      />

      <DespachoPickerModal
        visible={despachoPickerOpen}
        memberships={memberships}
        selectedMembership={selectedMembership}
        loading={loadingMemberships}
        error={membershipError}
        onClose={() => setDespachoPickerOpen(false)}
        onSelect={(membership) => {
          selectMembership(membership);
          setDespachoPickerOpen(false);
          setActiveSection('dashboard');
        }}
        onRefresh={fetchMemberships}
        onManage={() => {
          setDespachoPickerOpen(false);
          setActiveSection('despachos');
        }}
      />
    </View>
  );
}

function DashboardScreen({
  selectedMembership,
  onNavigate,
  onQuickAction,
}: {
  selectedMembership: DespachoMember | null;
  onNavigate: (section: Section) => void;
  onQuickAction: () => void;
}) {
  const despachoId = selectedMembership?.despacho_id ?? '';
  const [loading, setLoading] = useState(false);
  const [counts, setCounts] = useState({
    total: 0,
    activos: 0,
    clientes: 0,
    movimientos: 0,
    laboral: 0,
    archivo: 0,
  });
  const [reportItems, setReportItems] = useState<ReportItem[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<CalendarEvent[]>([]);

  const fetchDashboard = useCallback(async () => {
    if (!despachoId) {
      setCounts({ total: 0, activos: 0, clientes: 0, movimientos: 0, laboral: 0, archivo: 0 });
      setReportItems([]);
      setUpcomingEvents([]);
      return;
    }

    setLoading(true);
    const today = toDatabaseDateFromDate(new Date());
    const [
      totalResponse,
      activeResponse,
      clientsResponse,
      movementsResponse,
      laborResponse,
      archiveResponse,
      recentExpedientes,
      recentMovimientos,
      recentClientes,
      upcomingResponse,
    ] = await Promise.all([
      supabase.from('expedientes').select('*', { count: 'exact', head: true }).eq('despacho_id', despachoId),
      supabase
        .from('expedientes')
        .select('*', { count: 'exact', head: true })
        .eq('despacho_id', despachoId)
        .neq('estatus', 'Archivado'),
      supabase.from('clientes').select('*', { count: 'exact', head: true }).eq('despacho_id', despachoId),
      supabase.from('movimientos').select('*', { count: 'exact', head: true }).eq('despacho_id', despachoId),
      supabase.from('laboral_asuntos').select('*', { count: 'exact', head: true }).eq('despacho_id', despachoId),
      supabase
        .from('expedientes')
        .select('*', { count: 'exact', head: true })
        .eq('despacho_id', despachoId)
        .eq('estatus', 'Archivado'),
      supabase
        .from('expedientes')
        .select('numero_expediente,partes,created_at')
        .eq('despacho_id', despachoId)
        .order('created_at', { ascending: false })
        .limit(2),
      supabase
        .from('movimientos')
        .select('tipo,descripcion,created_at')
        .eq('despacho_id', despachoId)
        .order('created_at', { ascending: false })
        .limit(2),
      supabase
        .from('clientes')
        .select('nombre,created_at')
        .eq('despacho_id', despachoId)
        .order('created_at', { ascending: false })
        .limit(2),
      supabase
        .from('calendario_eventos')
        .select('id,titulo,descripcion,event_date,event_time,expediente_id,movimiento_id,created_at')
        .eq('despacho_id', despachoId)
        .gte('event_date', today)
        .order('event_date', { ascending: true })
        .order('event_time', { ascending: true })
        .limit(4),
    ]);

    setCounts({
      total: totalResponse.count ?? 0,
      activos: activeResponse.count ?? 0,
      clientes: clientsResponse.count ?? 0,
      movimientos: movementsResponse.count ?? 0,
      laboral: laborResponse.count ?? 0,
      archivo: archiveResponse.count ?? 0,
    });

    const reports: ReportItem[] = [
      ...(recentMovimientos.data ?? []).map((item) => ({
        type: 'movimiento' as const,
        label: item.tipo || 'Movimiento',
        detail: item.descripcion || 'Movimiento registrado',
      })),
      ...(recentExpedientes.data ?? []).map((item) => ({
        type: 'expediente' as const,
        label: `Expediente ${item.numero_expediente}`,
        detail: item.partes,
      })),
      ...(recentClientes.data ?? []).map((item) => ({
        type: 'cliente' as const,
        label: 'Cliente agregado',
        detail: item.nombre,
      })),
    ].slice(0, 5);

    setReportItems(reports);
    setUpcomingEvents((upcomingResponse.data ?? []).map((event) => fromDatabaseCalendarEvent(event)));
    setLoading(false);
  }, [despachoId]);

  useEffect(() => {
    void fetchDashboard();
  }, [fetchDashboard]);

  const statCards: StatCard[] = [
    { title: 'Total Expedientes', value: String(counts.total), icon: 'document-text-outline', tone: 'blue', target: 'totalExpedientes' },
    { title: 'Expedientes Activos', value: String(counts.activos), icon: 'trending-up-outline', tone: 'green', target: 'expedientes' },
    { title: 'Clientes', value: String(counts.clientes), icon: 'people-outline', tone: 'orange', target: 'clientes' },
    { title: 'Movimientos', value: String(counts.movimientos), icon: 'document-attach-outline', tone: 'cyan', target: 'movimientos' },
    { title: 'Asuntos Laborales', value: String(counts.laboral), icon: 'business-outline', tone: 'slate', target: 'laboral' },
    { title: 'Archivo', value: String(counts.archivo), icon: 'archive-outline', tone: 'indigo', target: 'archivo' },
  ];

  return (
    <View style={styles.stack}>
      <View style={styles.titleRow}>
        <View style={styles.titleCopy}>
          <Text style={styles.screenTitle}>Inicio</Text>
          <Text style={styles.screenSubtitle}>
            {selectedMembership ? getDespachoName(selectedMembership) : 'Selecciona un despacho para comenzar'}
          </Text>
        </View>
        <Pressable style={styles.iconButton} onPress={() => void fetchDashboard()}>
          {loading ? <ActivityIndicator size="small" color="#1d4ed8" /> : <Ionicons name="refresh-outline" size={19} color="#1d4ed8" />}
        </Pressable>
      </View>

      <Pressable style={styles.mobileQuickActionHero} onPress={onQuickAction}>
        <View style={styles.mobileQuickActionIcon}>
          <Ionicons name="add" size={27} color="#0c1424" />
        </View>
        <View style={styles.mobileQuickActionCopy}>
          <Text style={styles.mobileQuickActionTitle}>Nueva accion</Text>
          <Text style={styles.mobileQuickActionText}>Expediente, movimiento, audiencia, cliente o documento.</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#d4ab4e" />
      </Pressable>

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

      <View style={styles.agendaPreview}>
        <View style={styles.agendaPreviewHeader}>
          <View>
            <Text style={styles.cardTitle}>Proximas audiencias</Text>
            <Text style={styles.cardText}>Prioridades para hoy y los siguientes dias.</Text>
          </View>
          <Pressable onPress={() => onNavigate('calendario')}>
            <Text style={styles.linkText}>Ver agenda</Text>
          </Pressable>
        </View>
        {upcomingEvents.length === 0 ? (
          <Text style={styles.agendaEmptyText}>No hay audiencias futuras registradas.</Text>
        ) : (
          upcomingEvents.map((event) => (
            <Pressable key={event.id} style={styles.agendaPreviewRow} onPress={() => onNavigate('calendario')}>
              <View style={styles.agendaPreviewDate}>
                <Text style={styles.agendaPreviewDay}>{event.dateInput.slice(0, 2)}</Text>
                <Text style={styles.agendaPreviewMonth}>{event.dateInput.slice(3, 5)}</Text>
              </View>
              <View style={styles.agendaPreviewCopy}>
                <Text style={styles.cardTitle}>{event.title}</Text>
                <Text style={styles.cardText}>{getAudienceRecommendation(event.eventAt)}</Text>
              </View>
              <Ionicons name="notifications-outline" size={19} color="#1d4ed8" />
            </Pressable>
          ))
        )}
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

function TotalExpedientesScreen({
  selectedMembership,
  onNavigate,
}: {
  selectedMembership: DespachoMember | null;
  onNavigate: (section: Section) => void;
}) {
  const [expedientes, setExpedientes] = useState<MobileExpediente[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const despachoId = selectedMembership?.despacho_id;
    if (!despachoId) {
      setExpedientes([]);
      return;
    }

    setLoading(true);
    void supabase
      .from('expedientes')
      .select('*')
      .eq('despacho_id', despachoId)
      .order('updated_at', { ascending: false })
      .then(({ data }) => {
        setExpedientes((data ?? []) as MobileExpediente[]);
        setLoading(false);
      });
  }, [selectedMembership?.despacho_id]);

  const normalizedSearch = normalizeForModeration(search);
  const visible = expedientes.filter((item) =>
    normalizeForModeration(`${item.numero_expediente} ${item.partes} ${item.juzgado}`).includes(normalizedSearch),
  );

  return (
    <View style={styles.stack}>
      <ScreenHeader
        title="Total Expedientes"
        subtitle="Directorio completo ordenado por fecha de ingreso y ultima modificacion."
      />
      <TextInput
        onChangeText={setSearch}
        placeholder="Buscar expediente, partes o juzgado"
        placeholderTextColor="#94a3b8"
        style={styles.input}
        value={search}
      />
      <Text style={styles.sectionMiniTitle}>{loading ? 'Cargando...' : `${visible.length} expediente(s)`}</Text>
      {visible.map((expediente) => (
        <View key={expediente.id} style={styles.recordCard}>
          <View style={styles.recordTitleRow}>
            <Text style={styles.cardTitle}>{expediente.numero_expediente}</Text>
            <Text style={styles.recordPill}>{expediente.estatus}</Text>
          </View>
          <Text style={styles.cardText}>{expediente.partes}</Text>
          <Text style={styles.cardText}>{getShortCourtName(expediente.juzgado)}</Text>
          <Text style={styles.recordTimestamp}>
            Actualizado {formatMessageTime(expediente.updated_at || expediente.created_at)}
          </Text>
        </View>
      ))}
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
  quickAction,
}: {
  selectedMembership: DespachoMember | null;
  currentUserId: string;
  quickAction: { type: QuickAction; nonce: number } | null;
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
  const [expandedExpedienteId, setExpandedExpedienteId] = useState('');
  const [detailMovimientos, setDetailMovimientos] = useState<MobileMovimiento[]>([]);
  const [detailAttachments, setDetailAttachments] = useState<MobileDocumentAttachment[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

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

  useEffect(() => {
    if (!quickAction || !['expediente', 'scan'].includes(quickAction.type)) return;
    const defaultMateria: MateriaJuzgado = 'Mercantil';
    const defaultJuzgado = getMateriaJuzgados(defaultMateria)[0];
    setSelectedMateria(defaultMateria);
    setSelectedJuzgado(defaultJuzgado);
    setFormData(createEmptyExpedienteForm(defaultMateria, defaultJuzgado.nombre));

    if (quickAction.type === 'scan') {
      void (async () => {
        const captured = await pickCameraImage();
        if (captured.error) {
          setErrorMessage(captured.error);
          return;
        }
        setSelectedFile(captured.file);
        if (captured.file) setFeedback('Documento capturado. Completa los datos del expediente para guardarlo.');
      })();
    }
  }, [quickAction?.nonce]);

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

  const handleCameraFile = async () => {
    const captured = await pickCameraImage();
    if (captured.error) {
      setErrorMessage(captured.error);
      return;
    }
    setSelectedFile(captured.file);
  };

  const toggleExpedienteDetails = async (expedienteId: string) => {
    if (expandedExpedienteId === expedienteId) {
      setExpandedExpedienteId('');
      return;
    }

    setExpandedExpedienteId(expedienteId);
    setLoadingDetails(true);
    const [movimientosResponse, attachmentsResponse] = await Promise.all([
      supabase
        .from('movimientos')
        .select('*')
        .eq('expediente_id', expedienteId)
        .order('fecha', { ascending: false }),
      supabase
        .from('document_adjuntos')
        .select('*')
        .eq('expediente_id', expedienteId)
        .order('created_at', { ascending: false }),
    ]);

    setDetailMovimientos((movimientosResponse.data ?? []) as MobileMovimiento[]);
    setDetailAttachments((attachmentsResponse.data ?? []) as MobileDocumentAttachment[]);
    setLoadingDetails(false);
  };

  const openDocumentAttachment = async (attachment: MobileDocumentAttachment, share = false) => {
    const { data, error } = await supabase.storage
      .from(DOCUMENT_FILES_BUCKET)
      .createSignedUrl(attachment.storage_path, 60 * 60);
    if (error || !data?.signedUrl) {
      Alert.alert('No se pudo abrir', error?.message ?? 'No se genero el enlace del documento.');
      return;
    }

    if (share) {
      await shareRemoteFile(data.signedUrl, attachment.file_name, attachment.file_type);
      return;
    }
    await Linking.openURL(data.signedUrl);
  };

  const archiveExpediente = async (expediente: MobileExpediente) => {
    if (!canEdit) {
      Alert.alert('Solo lectura', 'Pide permiso de edicion para cambiar el estatus.');
      return;
    }

    const nextStatus = expediente.estatus === 'Archivado' ? 'Activo' : 'Archivado';
    Alert.alert(
      nextStatus === 'Archivado' ? 'Archivar expediente' : 'Recuperar expediente',
      `${expediente.numero_expediente} cambiara a ${nextStatus}.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: () => {
            void supabase
              .from('expedientes')
              .update({ estatus: nextStatus, updated_at: new Date().toISOString() })
              .eq('id', expediente.id)
              .then(({ error: updateError }) => {
                if (updateError) {
                  Alert.alert('No se pudo actualizar', updateError.message);
                  return;
                }
                void fetchExpedientes();
              });
          },
        },
      ],
    );
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
            <Pressable style={styles.secondaryIconButton} onPress={handleCameraFile}>
              <Ionicons name="camera-outline" size={20} color="#1d4ed8" />
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
          visibleExpedientes.map((expediente) => {
            const expanded = expandedExpedienteId === expediente.id;
            return (
              <View key={expediente.id} style={styles.recordCard}>
                <Pressable style={styles.recordPressable} onPress={() => void toggleExpedienteDetails(expediente.id)}>
                  <View style={styles.recordTitleRow}>
                    <Text style={styles.cardTitle}>{expediente.numero_expediente}</Text>
                    <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={19} color="#1d4ed8" />
                  </View>
                  <Text style={styles.cardText}>{expediente.partes}</Text>
                  <View style={styles.recordMetaRow}>
                    <Text style={styles.recordPill}>{expediente.estatus}</Text>
                    <Text style={styles.recordPill}>{expediente.tipo_juicio ?? getMateriaForExpediente(expediente)}</Text>
                  </View>
                  <Text style={styles.cardText}>{getShortCourtName(expediente.juzgado)}</Text>
                </Pressable>

                {expanded && (
                  <View style={styles.recordDetails}>
                    {loadingDetails ? (
                      <ActivityIndicator color="#1d4ed8" />
                    ) : (
                      <>
                        <Text style={styles.detailSectionTitle}>Movimientos</Text>
                        {detailMovimientos.length === 0 ? (
                          <Text style={styles.cardText}>Todavia no tiene movimientos.</Text>
                        ) : (
                          detailMovimientos.slice(0, 5).map((movimiento) => (
                            <View key={movimiento.id} style={styles.detailRow}>
                              <Text style={styles.detailRowTitle}>{movimiento.tipo}</Text>
                              <Text style={styles.detailRowText}>{movimiento.descripcion}</Text>
                              <Text style={styles.detailRowMeta}>{toMexicanDateFromDatabase(movimiento.fecha)}</Text>
                            </View>
                          ))
                        )}

                        <Text style={styles.detailSectionTitle}>Documentos</Text>
                        {detailAttachments.length === 0 ? (
                          <Text style={styles.cardText}>Sin archivos adjuntos.</Text>
                        ) : (
                          detailAttachments.map((attachment) => (
                            <View key={attachment.id} style={styles.attachmentRow}>
                              <Ionicons name="document-attach-outline" size={20} color="#1d4ed8" />
                              <View style={styles.attachmentCopy}>
                                <Text style={styles.attachmentName}>{attachment.file_name}</Text>
                                <Text style={styles.attachmentSize}>{formatFileSize(attachment.file_size)}</Text>
                              </View>
                              <Pressable style={styles.attachmentShareButton} onPress={() => void openDocumentAttachment(attachment)}>
                                <Ionicons name="open-outline" size={17} color="#1d4ed8" />
                              </Pressable>
                              <Pressable
                                style={styles.attachmentShareButton}
                                onPress={() => void openDocumentAttachment(attachment, true)}
                              >
                                <Ionicons name="share-social-outline" size={17} color="#1d4ed8" />
                              </Pressable>
                            </View>
                          ))
                        )}

                        <Pressable style={styles.secondaryActionCompact} onPress={() => void archiveExpediente(expediente)}>
                          <Ionicons
                            name={expediente.estatus === 'Archivado' ? 'arrow-undo-outline' : 'archive-outline'}
                            size={18}
                            color="#1d4ed8"
                          />
                          <Text style={styles.secondaryActionCompactText}>
                            {expediente.estatus === 'Archivado' ? 'Recuperar expediente' : 'Enviar al archivo'}
                          </Text>
                        </Pressable>
                      </>
                    )}
                  </View>
                )}
              </View>
            );
          })
        )}
      </View>
    </View>
  );
}

function ArchivoScreen({
  selectedMembership,
  onNavigate,
}: {
  selectedMembership: DespachoMember | null;
  onNavigate: (section: Section) => void;
}) {
  const [expedientes, setExpedientes] = useState<MobileExpediente[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchArchived = useCallback(async () => {
    const despachoId = selectedMembership?.despacho_id;
    if (!despachoId) {
      setExpedientes([]);
      return;
    }

    setLoading(true);
    const { data } = await supabase
      .from('expedientes')
      .select('*')
      .eq('despacho_id', despachoId)
      .eq('estatus', 'Archivado')
      .order('updated_at', { ascending: false });
    setExpedientes((data ?? []) as MobileExpediente[]);
    setLoading(false);
  }, [selectedMembership?.despacho_id]);

  useEffect(() => {
    void fetchArchived();
  }, [fetchArchived]);

  const restore = async (expediente: MobileExpediente) => {
    const { error } = await supabase
      .from('expedientes')
      .update({ estatus: 'Activo', updated_at: new Date().toISOString() })
      .eq('id', expediente.id);
    if (error) {
      Alert.alert('No se pudo recuperar', error.message);
      return;
    }
    void fetchArchived();
  };

  return (
    <View style={styles.stack}>
      <ScreenHeader title="Archivo" subtitle="Expedientes archivados separados de los activos." />
      <Text style={styles.sectionMiniTitle}>{loading ? 'Cargando...' : `${expedientes.length} expediente(s) archivado(s)`}</Text>
      {expedientes.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateTitle}>Archivo vacio</Text>
          <Text style={styles.emptyStateText}>Los expedientes con estatus Archivado apareceran aqui.</Text>
        </View>
      ) : (
        expedientes.map((expediente) => (
          <View key={expediente.id} style={styles.recordCard}>
            <Text style={styles.cardTitle}>{expediente.numero_expediente}</Text>
            <Text style={styles.cardText}>{expediente.partes}</Text>
            <Text style={styles.cardText}>{getShortCourtName(expediente.juzgado)}</Text>
            <Pressable style={styles.secondaryActionCompact} onPress={() => void restore(expediente)}>
              <Ionicons name="arrow-undo-outline" size={18} color="#1d4ed8" />
              <Text style={styles.secondaryActionCompactText}>Recuperar</Text>
            </Pressable>
          </View>
        ))
      )}
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
  quickAction,
}: {
  selectedMembership: DespachoMember | null;
  currentUserId: string;
  onCreateCalendarEvent: (
    title: string,
    dateInput: string,
    timeInput: string,
    options?: {
      description?: string;
      expedienteId?: string | null;
      movimientoId?: string | null;
      tipo?: 'audiencia' | 'vencimiento' | 'recordatorio' | 'otro';
    },
  ) => Promise<{ ok: boolean; message: string }>;
  quickAction: { type: QuickAction; nonce: number } | null;
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

  useEffect(() => {
    if (!quickAction || !['movimiento', 'audiencia'].includes(quickAction.type)) return;
    setTipo(quickAction.type === 'audiencia' ? 'Audiencia' : 'Otros');
    setFecha(toDateInputValue());
    setHora('09:00');
    setFeedback(quickAction.type === 'audiencia' ? 'Completa los datos para agendar la audiencia.' : '');
  }, [quickAction?.nonce]);

  const handlePickFile = async () => {
    const picked = await pickSupportedDocumentFile();
    if (picked.error) {
      setErrorMessage(picked.error);
      return;
    }
    setSelectedFile(picked.file);
  };

  const handleCameraFile = async () => {
    const captured = await pickCameraImage();
    if (captured.error) {
      setErrorMessage(captured.error);
      return;
    }
    setSelectedFile(captured.file);
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
      const calendarResult = await onCreateCalendarEvent(
        `Audiencia - ${selectedExpediente?.numero_expediente ?? 'Expediente'}`,
        fecha,
        hora,
        {
          description: descripcion.trim(),
          expedienteId: selectedExpedienteId,
          movimientoId: data.id as string,
          tipo: 'audiencia',
        },
      );
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

        <NativeDateTimeField
          dateLabel={isAudiencia(tipo) ? 'Fecha de audiencia' : 'Fecha'}
          dateInput={fecha}
          timeInput={hora}
          onDateChange={setFecha}
          onTimeChange={setHora}
          showTime={isAudiencia(tipo)}
          futureOnly={isAudiencia(tipo)}
        />

        {isAudiencia(tipo) && (
          <View style={styles.audienceTip}>
            <Ionicons name="information-circle-outline" size={20} color="#1d4ed8" />
            <Text style={styles.audienceTipText}>
              La audiencia se agregara a la agenda compartida y se programaran avisos un dia antes y el mismo dia.
            </Text>
          </View>
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
          <Pressable style={styles.secondaryIconButton} onPress={handleCameraFile}>
            <Ionicons name="camera-outline" size={20} color="#1d4ed8" />
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
  onAddToDeviceCalendar,
}: {
  events: CalendarEvent[];
  notificationStatus: NotificationPermissionStatus;
  onCreateCalendarEvent: (
    title: string,
    dateInput: string,
    timeInput: string,
    options?: { description?: string; tipo?: 'audiencia' | 'vencimiento' | 'recordatorio' | 'otro' },
  ) => Promise<{ ok: boolean; message: string }>;
  onDeleteCalendarEvent: (eventId: string) => Promise<void>;
  onRequestPermission: () => Promise<boolean>;
  onAddToDeviceCalendar: (event: CalendarEvent) => Promise<void>;
}) {
  const [eventTitle, setEventTitle] = useState('Audiencia');
  const [eventDate, setEventDate] = useState('');
  const [eventTime, setEventTime] = useState('09:00');
  const [feedback, setFeedback] = useState('');

  const handleCreateEvent = async () => {
    const result = await onCreateCalendarEvent(eventTitle, eventDate, eventTime, {
      description: 'Evento creado desde la agenda movil',
      tipo: 'audiencia',
    });
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
        <NativeDateTimeField
          dateLabel="Fecha"
          dateInput={eventDate}
          timeInput={eventTime}
          onDateChange={setEventDate}
          onTimeChange={setEventTime}
          showTime
          futureOnly
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
              <Text style={styles.audienceRecommendation}>{getAudienceRecommendation(event.eventAt)}</Text>
              <Text style={styles.cardText}>
                {event.notificationIds.length > 0 ? 'Avisos programados' : 'Guardado sin avisos del sistema'}
              </Text>
            </View>
            <View style={styles.calendarActions}>
              <Pressable style={styles.iconButton} onPress={() => void onAddToDeviceCalendar(event)}>
                <Ionicons name="phone-portrait-outline" size={18} color="#1d4ed8" />
              </Pressable>
              <Pressable style={styles.iconDangerButton} onPress={() => onDeleteCalendarEvent(event.id)}>
                <Ionicons name="trash-outline" size={18} color="#be123c" />
              </Pressable>
            </View>
          </View>
        ))
      )}
    </View>
  );
}

function ClientesScreen({
  selectedMembership,
  quickAction,
}: {
  selectedMembership: DespachoMember | null;
  quickAction: { type: QuickAction; nonce: number } | null;
}) {
  const despachoId = selectedMembership?.despacho_id ?? '';
  const canEdit = canEditMembership(selectedMembership);
  const [clientes, setClientes] = useState<MobileCliente[]>([]);
  const [nombre, setNombre] = useState('');
  const [montoPactado, setMontoPactado] = useState('');
  const [totalAdeudo, setTotalAdeudo] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const fetchClientes = useCallback(async () => {
    if (!despachoId) {
      setClientes([]);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('clientes')
      .select('*')
      .eq('despacho_id', despachoId)
      .order('created_at', { ascending: false });
    if (error) setErrorMessage(error.message);
    setClientes((data ?? []) as MobileCliente[]);
    setLoading(false);
  }, [despachoId]);

  useEffect(() => {
    void fetchClientes();
  }, [fetchClientes]);

  useEffect(() => {
    if (quickAction?.type === 'cliente') setFormOpen(true);
  }, [quickAction?.nonce]);

  const createCliente = async () => {
    if (!despachoId || !canEdit) {
      setErrorMessage(canEdit ? 'Selecciona un despacho.' : 'Tu acceso es de solo lectura.');
      return;
    }
    if (!nombre.trim()) {
      setErrorMessage('Escribe el nombre del cliente.');
      return;
    }

    setSaving(true);
    setErrorMessage('');
    const { error } = await supabase.from('clientes').insert([
      {
        despacho_id: despachoId,
        nombre: nombre.trim(),
        monto_pactado: Number(montoPactado.replace(',', '.')) || 0,
        total_adeudo: Number(totalAdeudo.replace(',', '.')) || 0,
      },
    ]);

    if (error) {
      setErrorMessage(error.message);
      setSaving(false);
      return;
    }

    setNombre('');
    setMontoPactado('');
    setTotalAdeudo('');
    setFormOpen(false);
    setSaving(false);
    void fetchClientes();
  };

  const deleteCliente = (cliente: MobileCliente) => {
    if (!canEdit) return;
    Alert.alert('Eliminar cliente', `Se eliminara a ${cliente.nombre}.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: () => {
          void supabase
            .from('clientes')
            .delete()
            .eq('id', cliente.id)
            .then(({ error }) => {
              if (error) Alert.alert('No se pudo eliminar', error.message);
              else void fetchClientes();
            });
        },
      },
    ]);
  };

  const visibleClientes = clientes.filter((cliente) =>
    normalizeForModeration(cliente.nombre).includes(normalizeForModeration(search)),
  );

  return (
    <View style={styles.stack}>
      <View style={styles.titleRow}>
        <View style={styles.titleCopy}>
          <Text style={styles.screenTitle}>Clientes</Text>
          <Text style={styles.screenSubtitle}>Honorarios y adeudos del despacho.</Text>
        </View>
        <Pressable style={styles.smallPrimaryButton} onPress={() => setFormOpen((current) => !current)}>
          <Ionicons name={formOpen ? 'close' : 'add'} size={20} color="#ffffff" />
        </Pressable>
      </View>

      {formOpen && (
        <View style={styles.formPreview}>
          <Text style={styles.cardTitle}>Nuevo cliente</Text>
          <Text style={styles.inputLabel}>Nombre</Text>
          <TextInput
            onChangeText={setNombre}
            placeholder="Nombre completo o razon social"
            placeholderTextColor="#94a3b8"
            style={styles.input}
            value={nombre}
          />
          <View style={styles.twoColumnRow}>
            <View style={styles.twoColumnField}>
              <Text style={styles.inputLabel}>Monto pactado</Text>
              <TextInput
                keyboardType="decimal-pad"
                onChangeText={setMontoPactado}
                placeholder="0.00"
                placeholderTextColor="#94a3b8"
                style={styles.input}
                value={montoPactado}
              />
            </View>
            <View style={styles.twoColumnField}>
              <Text style={styles.inputLabel}>Adeudo actual</Text>
              <TextInput
                keyboardType="decimal-pad"
                onChangeText={setTotalAdeudo}
                placeholder="0.00"
                placeholderTextColor="#94a3b8"
                style={styles.input}
                value={totalAdeudo}
              />
            </View>
          </View>
          <Pressable style={styles.primaryAction} onPress={() => void createCliente()} disabled={saving}>
            <Text style={styles.primaryActionText}>{saving ? 'Guardando...' : 'Guardar cliente'}</Text>
          </Pressable>
          {Boolean(errorMessage) && <Text style={styles.inlineError}>{errorMessage}</Text>}
        </View>
      )}

      <TextInput
        onChangeText={setSearch}
        placeholder="Buscar cliente"
        placeholderTextColor="#94a3b8"
        style={styles.input}
        value={search}
      />
      <Text style={styles.sectionMiniTitle}>{loading ? 'Cargando...' : `${visibleClientes.length} cliente(s)`}</Text>
      {visibleClientes.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateTitle}>Sin clientes</Text>
          <Text style={styles.emptyStateText}>Agrega el primer cliente desde el boton superior.</Text>
        </View>
      ) : (
        visibleClientes.map((cliente) => (
          <View key={cliente.id} style={styles.recordCard}>
            <View style={styles.recordTitleRow}>
              <Text style={styles.cardTitle}>{cliente.nombre}</Text>
              {canEdit && (
                <Pressable style={styles.miniDangerButton} onPress={() => deleteCliente(cliente)}>
                  <Ionicons name="trash-outline" size={17} color="#be123c" />
                </Pressable>
              )}
            </View>
            <View style={styles.moneyRow}>
              <View style={styles.moneyCell}>
                <Text style={styles.moneyLabel}>Pactado</Text>
                <Text style={styles.moneyValue}>{formatCurrency(cliente.monto_pactado)}</Text>
              </View>
              <View style={styles.moneyCell}>
                <Text style={styles.moneyLabel}>Adeudo</Text>
                <Text style={[styles.moneyValue, cliente.total_adeudo > 0 && styles.moneyValueDue]}>
                  {formatCurrency(cliente.total_adeudo)}
                </Text>
              </View>
            </View>
          </View>
        ))
      )}
    </View>
  );
}

function LaboralScreen({ selectedMembership }: { selectedMembership: DespachoMember | null }) {
  const despachoId = selectedMembership?.despacho_id ?? '';
  const canEdit = canEditMembership(selectedMembership);
  const [asuntos, setAsuntos] = useState<MobileLaboralAsunto[]>([]);
  const [section, setSection] = useState<LaboralSeccion>('conciliacion');
  const [formOpen, setFormOpen] = useState(false);
  const [partes, setPartes] = useState('');
  const [numero, setNumero] = useState('');
  const [procedimiento, setProcedimiento] = useState<LaboralProcedimiento>('normal');
  const [fechaConciliacion, setFechaConciliacion] = useState(toDateInputValue());
  const [hojaConciliacion, setHojaConciliacion] = useState(false);
  const [notas, setNotas] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const fetchAsuntos = useCallback(async () => {
    if (!despachoId) {
      setAsuntos([]);
      return;
    }
    const { data, error } = await supabase
      .from('laboral_asuntos')
      .select('*')
      .eq('despacho_id', despachoId)
      .order('updated_at', { ascending: false });
    if (error) setErrorMessage(error.message);
    setAsuntos((data ?? []) as MobileLaboralAsunto[]);
  }, [despachoId]);

  useEffect(() => {
    void fetchAsuntos();
  }, [fetchAsuntos]);

  const createAsunto = async () => {
    if (!despachoId || !canEdit) {
      setErrorMessage(canEdit ? 'Selecciona un despacho.' : 'Tu acceso es de solo lectura.');
      return;
    }
    if (!partes.trim()) {
      setErrorMessage('Escribe el nombre de las partes.');
      return;
    }
    if (section !== 'conciliacion' && !numero.trim()) {
      setErrorMessage('Escribe el numero de expediente.');
      return;
    }

    const databaseDate = section === 'conciliacion' ? parseMexicanDateToDatabase(fechaConciliacion) : null;
    if (section === 'conciliacion' && !databaseDate) {
      setErrorMessage('Selecciona una fecha valida de conciliacion.');
      return;
    }

    const { error } = await supabase.from('laboral_asuntos').insert([
      {
        despacho_id: despachoId,
        seccion: section,
        numero_expediente: section === 'conciliacion' ? null : numero.trim(),
        partes: partes.trim(),
        procedimiento: section === 'conciliacion' ? null : procedimiento,
        fecha_conciliacion: section === 'conciliacion' ? databaseDate : null,
        hoja_conciliacion: section === 'conciliacion' ? hojaConciliacion : null,
        estatus: 'Activo',
        notas: notas.trim(),
      },
    ]);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setPartes('');
    setNumero('');
    setNotas('');
    setHojaConciliacion(false);
    setFormOpen(false);
    setErrorMessage('');
    void fetchAsuntos();
  };

  const sectionLabels: Record<LaboralSeccion, string> = {
    conciliacion: 'Conciliacion',
    junta_local: 'Junta Local',
    tribunal_laboral: 'Tribunal Laboral',
  };

  const visible = asuntos.filter((asunto) => asunto.seccion === section);

  return (
    <View style={styles.stack}>
      <View style={styles.titleRow}>
        <View style={styles.titleCopy}>
          <Text style={styles.screenTitle}>Laboral</Text>
          <Text style={styles.screenSubtitle}>Conciliacion, junta local y tribunal laboral.</Text>
        </View>
        <Pressable style={styles.smallPrimaryButton} onPress={() => setFormOpen((current) => !current)}>
          <Ionicons name={formOpen ? 'close' : 'add'} size={20} color="#ffffff" />
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.segmentRow}>
        {(Object.keys(sectionLabels) as LaboralSeccion[]).map((item) => (
          <Pressable
            key={item}
            style={[styles.segmentButton, section === item && styles.segmentButtonActive]}
            onPress={() => setSection(item)}
          >
            <Text style={[styles.segmentButtonText, section === item && styles.segmentButtonTextActive]}>
              {sectionLabels[item]}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {formOpen && (
        <View style={styles.formPreview}>
          <Text style={styles.cardTitle}>Nuevo asunto: {sectionLabels[section]}</Text>
          <Text style={styles.inputLabel}>Partes</Text>
          <TextInput
            onChangeText={setPartes}
            placeholder="Trabajador vs Empresa"
            placeholderTextColor="#94a3b8"
            style={styles.input}
            value={partes}
          />

          {section === 'conciliacion' ? (
            <>
              <NativeDateTimeField
                dateLabel="Fecha de conciliacion"
                dateInput={fechaConciliacion}
                timeInput="09:00"
                onDateChange={setFechaConciliacion}
                onTimeChange={() => undefined}
                showTime={false}
              />
              <Pressable style={styles.toggleRow} onPress={() => setHojaConciliacion((current) => !current)}>
                <View>
                  <Text style={styles.cardTitle}>Hoja de conciliacion</Text>
                  <Text style={styles.cardText}>Marca si ya se cuenta con la constancia.</Text>
                </View>
                <View style={[styles.toggleTrack, hojaConciliacion && styles.toggleTrackActive]}>
                  <View style={[styles.toggleThumb, hojaConciliacion && styles.toggleThumbActive]} />
                </View>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.inputLabel}>Numero de expediente</Text>
              <TextInput
                onChangeText={setNumero}
                placeholder="123/2026"
                placeholderTextColor="#94a3b8"
                style={styles.input}
                value={numero}
              />
              <Text style={styles.inputLabel}>Procedimiento</Text>
              <View style={styles.chipWrap}>
                {(['normal', 'especial'] as LaboralProcedimiento[]).map((item) => (
                  <Pressable
                    key={item}
                    style={[styles.choiceChip, procedimiento === item && styles.choiceChipActive]}
                    onPress={() => setProcedimiento(item)}
                  >
                    <Text style={[styles.choiceChipText, procedimiento === item && styles.choiceChipTextActive]}>
                      {item === 'normal' ? 'Normal' : 'Especial'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          <Text style={styles.inputLabel}>Notas</Text>
          <TextInput
            multiline
            onChangeText={setNotas}
            placeholder="Pendientes o datos relevantes"
            placeholderTextColor="#94a3b8"
            style={[styles.input, styles.textArea]}
            value={notas}
          />
          <Pressable style={styles.primaryAction} onPress={() => void createAsunto()}>
            <Text style={styles.primaryActionText}>Guardar asunto</Text>
          </Pressable>
          {Boolean(errorMessage) && <Text style={styles.inlineError}>{errorMessage}</Text>}
        </View>
      )}

      {visible.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateTitle}>Sin asuntos en {sectionLabels[section]}</Text>
          <Text style={styles.emptyStateText}>Usa el boton superior para registrar el primero.</Text>
        </View>
      ) : (
        visible.map((asunto) => (
          <View key={asunto.id} style={styles.recordCard}>
            <View style={styles.recordTitleRow}>
              <Text style={styles.cardTitle}>{asunto.numero_expediente || sectionLabels[asunto.seccion]}</Text>
              <Text style={styles.recordPill}>{asunto.estatus}</Text>
            </View>
            <Text style={styles.cardText}>{asunto.partes}</Text>
            {asunto.fecha_conciliacion && (
              <Text style={styles.cardText}>Conciliacion: {toMexicanDateFromDatabase(asunto.fecha_conciliacion)}</Text>
            )}
            {asunto.procedimiento && <Text style={styles.cardText}>Procedimiento: {asunto.procedimiento}</Text>}
            {Boolean(asunto.notas) && <Text style={styles.cardText}>{asunto.notas}</Text>}
          </View>
        ))
      )}
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

  const handleCameraFile = async () => {
    setErrorMessage('');
    const captured = await pickCameraImage();
    if (captured.error) {
      setErrorMessage(captured.error);
      return;
    }
    setSelectedFile(captured.file);
  };

  const openAttachment = async (attachment: ChatAttachment) => {
    const signedUrl = attachmentUrls[attachment.id];
    if (!signedUrl) {
      setErrorMessage('No se pudo generar el enlace del archivo.');
      return;
    }

    await Linking.openURL(signedUrl);
  };

  const shareAttachment = async (attachment: ChatAttachment) => {
    const signedUrl = attachmentUrls[attachment.id];
    if (!signedUrl) {
      setErrorMessage('No se pudo generar el enlace del archivo.');
      return;
    }

    try {
      await shareRemoteFile(signedUrl, attachment.file_name, attachment.file_type);
    } catch (shareError) {
      setErrorMessage(shareError instanceof Error ? shareError.message : 'No se pudo compartir el archivo.');
    }
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
                      <Pressable
                        style={styles.attachmentShareButton}
                        onPress={(event) => {
                          event.stopPropagation();
                          void shareAttachment(attachment);
                        }}
                      >
                        <Ionicons name="share-social-outline" size={17} color="#1d4ed8" />
                      </Pressable>
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
          <Pressable style={styles.secondaryIconButton} onPress={handleCameraFile}>
            <Ionicons name="camera-outline" size={20} color="#1d4ed8" />
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

function DespachosScreen({
  memberships,
  selectedMembership,
  onRefresh,
  onSelect,
}: {
  memberships: DespachoMember[];
  selectedMembership: DespachoMember | null;
  onRefresh: () => Promise<void>;
  onSelect: (membership: DespachoMember) => void;
}) {
  const [deskName, setDeskName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [working, setWorking] = useState<'create' | 'join' | null>(null);
  const [feedback, setFeedback] = useState('');
  const ownedCount = memberships.filter((membership) => membership.role === 'owner').length;

  const createDespacho = async () => {
    if (!deskName.trim()) {
      setFeedback('Escribe el nombre del despacho.');
      return;
    }
    if (ownedCount >= 2) {
      setFeedback('Ya creaste el maximo de 2 despachos.');
      return;
    }

    setWorking('create');
    setFeedback('');
    const { error } = await supabase.rpc('create_despacho', { despacho_nombre: deskName.trim() });
    if (error) {
      setFeedback(error.message);
    } else {
      setDeskName('');
      setFeedback('Despacho creado correctamente.');
      await onRefresh();
    }
    setWorking(null);
  };

  const joinDespacho = async () => {
    if (!inviteCode.trim()) {
      setFeedback('Escribe el codigo de invitacion.');
      return;
    }

    setWorking('join');
    setFeedback('');
    const { error } = await supabase.rpc('join_despacho_by_code', { invitation_code: inviteCode.trim() });
    if (error) {
      setFeedback(error.message);
    } else {
      setInviteCode('');
      setFeedback('Te uniste como solo lectura. Un administrador puede darte permiso de edicion.');
      await onRefresh();
    }
    setWorking(null);
  };

  return (
    <View style={styles.stack}>
      <ScreenHeader title="Despachos" subtitle="Crea tu espacio de trabajo o unete mediante un codigo." />

      <View style={styles.formPreview}>
        <View style={styles.recordTitleRow}>
          <Text style={styles.cardTitle}>Crear despacho</Text>
          <Text style={styles.recordPill}>{ownedCount}/2 propios</Text>
        </View>
        <Text style={styles.inputLabel}>Nombre</Text>
        <TextInput
          onChangeText={setDeskName}
          placeholder="Martinez Legal"
          placeholderTextColor="#94a3b8"
          style={styles.input}
          value={deskName}
        />
        <Pressable style={styles.primaryAction} onPress={() => void createDespacho()} disabled={working !== null}>
          {working === 'create' ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryActionText}>Crear despacho</Text>}
        </Pressable>
      </View>

      <View style={styles.formPreview}>
        <Text style={styles.cardTitle}>Unirme a un despacho</Text>
        <Text style={styles.cardText}>El codigo cambia cada dia y el acceso inicial siempre es de solo lectura.</Text>
        <Text style={styles.inputLabel}>Codigo de invitacion</Text>
        <TextInput
          autoCapitalize="characters"
          onChangeText={setInviteCode}
          placeholder="JM-XXXX-XXXX"
          placeholderTextColor="#94a3b8"
          style={styles.input}
          value={inviteCode}
        />
        <Pressable style={styles.secondaryAction} onPress={() => void joinDespacho()} disabled={working !== null}>
          {working === 'join' ? <ActivityIndicator color="#1d4ed8" /> : <Text style={styles.secondaryActionText}>Unirme</Text>}
        </Pressable>
      </View>

      {Boolean(feedback) && <Text style={styles.inlineFeedback}>{feedback}</Text>}

      <Text style={styles.sectionMiniTitle}>Mis despachos</Text>
      {memberships.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateTitle}>Todavia no perteneces a un despacho</Text>
          <Text style={styles.emptyStateText}>Crea uno o solicita el codigo diario al propietario.</Text>
        </View>
      ) : (
        memberships.map((membership) => {
          const active = membership.id === selectedMembership?.id;
          return (
            <Pressable
              key={membership.id}
              style={[styles.compactRow, active && styles.compactRowActive]}
              onPress={() => onSelect(membership)}
            >
              <View style={styles.compactIcon}>
                <Ionicons name="briefcase-outline" size={19} color="#1d4ed8" />
              </View>
              <View style={styles.compactCopy}>
                <Text style={styles.cardTitle}>{getDespachoName(membership)}</Text>
                <Text style={styles.cardText}>{roleLabels[membership.role]}</Text>
              </View>
              {active ? (
                <Ionicons name="checkmark-circle" size={21} color="#15803d" />
              ) : (
                <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
              )}
            </Pressable>
          );
        })
      )}
    </View>
  );
}

function MoreScreen({ onNavigate }: { onNavigate: (section: Section) => void }) {
  const options: Array<{
    title: string;
    detail: string;
    icon: keyof typeof Ionicons.glyphMap;
    target: Section;
  }> = [
    { title: 'Movimientos', detail: 'Acuerdos, promociones y documentos.', icon: 'document-attach-outline', target: 'movimientos' },
    { title: 'Clientes', detail: 'Honorarios y adeudos.', icon: 'people-outline', target: 'clientes' },
    { title: 'Laboral', detail: 'Conciliacion y expedientes laborales.', icon: 'business-outline', target: 'laboral' },
    { title: 'Despachos', detail: 'Crear, unirse y cambiar espacio de trabajo.', icon: 'briefcase-outline', target: 'despachos' },
    { title: 'Archivo', detail: 'Expedientes archivados y recuperacion.', icon: 'archive-outline', target: 'archivo' },
    { title: 'Todos los expedientes', detail: 'Directorio por fecha de modificacion.', icon: 'list-outline', target: 'totalExpedientes' },
    { title: 'Configuracion', detail: 'Perfil, seguridad y actualizaciones.', icon: 'settings-outline', target: 'configuracion' },
  ];

  return (
    <View style={styles.stack}>
      <ScreenHeader title="Mas" subtitle="Herramientas administrativas y modulos complementarios." />
      <View style={styles.moreGrid}>
        {options.map((option) => (
          <Pressable key={option.target} style={styles.moreCard} onPress={() => onNavigate(option.target)}>
            <View style={styles.moreIcon}>
              <Ionicons name={option.icon} size={22} color="#1d4ed8" />
            </View>
            <Text style={styles.cardTitle}>{option.title}</Text>
            <Text style={styles.cardText}>{option.detail}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function QuickActionsModal({
  visible,
  onClose,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (action: QuickAction) => void;
}) {
  const actions: Array<{
    id: QuickAction;
    title: string;
    detail: string;
    icon: keyof typeof Ionicons.glyphMap;
  }> = [
    { id: 'expediente', title: 'Nuevo expediente', detail: 'Registrar juzgado, partes y archivo.', icon: 'folder-open-outline' },
    { id: 'movimiento', title: 'Nuevo movimiento', detail: 'Agregar acuerdo o promocion.', icon: 'document-attach-outline' },
    { id: 'audiencia', title: 'Nueva audiencia', detail: 'Agendar y programar avisos.', icon: 'calendar-outline' },
    { id: 'cliente', title: 'Nuevo cliente', detail: 'Registrar honorarios y adeudo.', icon: 'person-add-outline' },
    { id: 'scan', title: 'Escanear documento', detail: 'Usar la camara y adjuntarlo.', icon: 'scan-outline' },
  ];

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.bottomSheet} onPress={(event) => event.stopPropagation()}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.sheetTitle}>Acciones rapidas</Text>
              <Text style={styles.sheetSubtitle}>Que necesitas registrar?</Text>
            </View>
            <Pressable style={styles.iconButton} onPress={onClose}>
              <Ionicons name="close" size={20} color="#1d4ed8" />
            </Pressable>
          </View>
          {actions.map((action) => (
            <Pressable key={action.id} style={styles.sheetAction} onPress={() => onSelect(action.id)}>
              <View style={styles.sheetActionIcon}>
                <Ionicons name={action.icon} size={21} color="#1d4ed8" />
              </View>
              <View style={styles.sheetActionCopy}>
                <Text style={styles.cardTitle}>{action.title}</Text>
                <Text style={styles.cardText}>{action.detail}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function DespachoPickerModal({
  visible,
  memberships,
  selectedMembership,
  loading,
  error,
  onClose,
  onSelect,
  onRefresh,
  onManage,
}: {
  visible: boolean;
  memberships: DespachoMember[];
  selectedMembership: DespachoMember | null;
  loading: boolean;
  error: string;
  onClose: () => void;
  onSelect: (membership: DespachoMember) => void;
  onRefresh: () => Promise<void>;
  onManage: () => void;
}) {
  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.bottomSheet} onPress={(event) => event.stopPropagation()}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.sheetTitle}>Cambiar despacho</Text>
              <Text style={styles.sheetSubtitle}>Todos los modulos usaran el despacho seleccionado.</Text>
            </View>
            <Pressable style={styles.iconButton} onPress={() => void onRefresh()}>
              {loading ? <ActivityIndicator size="small" color="#1d4ed8" /> : <Ionicons name="refresh" size={19} color="#1d4ed8" />}
            </Pressable>
          </View>
          {Boolean(error) && <Text style={styles.inlineError}>{error}</Text>}
          {memberships.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateTitle}>Sin despachos disponibles</Text>
              <Text style={styles.emptyStateText}>Crea o unete a uno desde la aplicacion de escritorio.</Text>
            </View>
          ) : (
            memberships.map((membership) => {
              const active = membership.id === selectedMembership?.id;
              return (
                <Pressable
                  key={membership.id}
                  style={[styles.sheetAction, active && styles.sheetActionActive]}
                  onPress={() => onSelect(membership)}
                >
                  <View style={styles.sheetActionIcon}>
                    <Ionicons name="briefcase-outline" size={21} color="#1d4ed8" />
                  </View>
                  <View style={styles.sheetActionCopy}>
                    <Text style={styles.cardTitle}>{getDespachoName(membership)}</Text>
                    <Text style={styles.cardText}>{roleLabels[membership.role]}</Text>
                  </View>
                  {active && <Ionicons name="checkmark-circle" size={21} color="#15803d" />}
                </Pressable>
              );
            })
          )}
          <Pressable style={styles.secondaryAction} onPress={onManage}>
            <Text style={styles.secondaryActionText}>Crear o unirme a un despacho</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function NativeDateTimeField({
  dateLabel,
  dateInput,
  timeInput,
  onDateChange,
  onTimeChange,
  showTime,
  futureOnly = false,
}: {
  dateLabel: string;
  dateInput: string;
  timeInput: string;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  showTime: boolean;
  futureOnly?: boolean;
}) {
  const [pickerMode, setPickerMode] = useState<'date' | 'time' | null>(null);
  const pickerDate = parseCalendarDate(dateInput || toDateInputValue(), timeInput || '09:00') ?? new Date();

  const handlePickerChange = (_event: DateTimePickerEvent, selectedDate?: Date) => {
    setPickerMode(null);
    if (!selectedDate) return;
    if (pickerMode === 'date') onDateChange(toDateInputValue(selectedDate));
    if (pickerMode === 'time') onTimeChange(toTimeInputValue(selectedDate));
  };

  if (Platform.OS === 'web') {
    return (
      <>
        <Text style={styles.inputLabel}>{dateLabel}</Text>
        <TextInput
          keyboardType="numeric"
          onChangeText={onDateChange}
          placeholder="00/00/0000"
          placeholderTextColor="#94a3b8"
          style={styles.input}
          value={dateInput}
        />
        {showTime && (
          <>
            <Text style={styles.inputLabel}>Hora</Text>
            <TextInput
              keyboardType="numeric"
              onChangeText={onTimeChange}
              placeholder="09:00"
              placeholderTextColor="#94a3b8"
              style={styles.input}
              value={timeInput}
            />
          </>
        )}
      </>
    );
  }

  return (
    <>
      <Text style={styles.inputLabel}>{dateLabel}</Text>
      <Pressable style={styles.datePickerButton} onPress={() => setPickerMode('date')}>
        <Ionicons name="calendar-outline" size={20} color="#1d4ed8" />
        <Text style={styles.datePickerText}>{dateInput || 'Seleccionar fecha'}</Text>
        <Ionicons name="chevron-down" size={17} color="#64748b" />
      </Pressable>
      {showTime && (
        <>
          <Text style={styles.inputLabel}>Hora</Text>
          <Pressable style={styles.datePickerButton} onPress={() => setPickerMode('time')}>
            <Ionicons name="time-outline" size={20} color="#1d4ed8" />
            <Text style={styles.datePickerText}>{timeInput || 'Seleccionar hora'}</Text>
            <Ionicons name="chevron-down" size={17} color="#64748b" />
          </Pressable>
        </>
      )}
      {pickerMode && (
        <DateTimePicker
          value={pickerDate}
          mode={pickerMode}
          display="default"
          minimumDate={pickerMode === 'date' && futureOnly ? new Date() : undefined}
          onChange={handlePickerChange}
        />
      )}
    </>
  );
}

function ConfiguracionScreen({
  email,
  selectedMembership,
  profileSettings,
  onProfileSettingsChange,
  onNavigate,
  onSignOut,
  appVersion,
  appBuild,
  availableUpdate,
  checkingUpdate,
  updateMessage,
  onCheckForUpdates,
  onInstallUpdate,
  biometricAvailable,
  biometricEnabled,
  onBiometricChange,
  subscriptionStatus,
  trialEndsAt,
}: {
  email: string;
  selectedMembership: DespachoMember | null;
  profileSettings: ProfileSettings;
  onProfileSettingsChange: (settings: ProfileSettings) => void;
  onNavigate: (section: Section) => void;
  onSignOut: () => Promise<void>;
  appVersion: string;
  appBuild: number;
  availableUpdate: MobileReleaseManifest | null;
  checkingUpdate: boolean;
  updateMessage: string;
  onCheckForUpdates: () => void;
  onInstallUpdate: () => void;
  biometricAvailable: boolean;
  biometricEnabled: boolean;
  onBiometricChange: (enabled: boolean) => Promise<void>;
  subscriptionStatus?: AppProfile['subscription_status'];
  trialEndsAt?: string | null;
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

      <View style={styles.securityCard}>
        <View style={styles.securityCardHeader}>
          <View style={styles.securityIcon}>
            <Ionicons name="finger-print-outline" size={23} color="#1d4ed8" />
          </View>
          <View style={styles.securityCopy}>
            <Text style={styles.cardTitle}>Bloqueo biometrico</Text>
            <Text style={styles.cardText}>
              {biometricAvailable
                ? 'Pide huella o reconocimiento facial al volver a abrir la app.'
                : 'Configura la biometria en el telefono para activar esta opcion.'}
            </Text>
          </View>
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: biometricEnabled }}
            style={[styles.toggleTrack, biometricEnabled && styles.toggleTrackActive]}
            onPress={() => void onBiometricChange(!biometricEnabled)}
          >
            <View style={[styles.toggleThumb, biometricEnabled && styles.toggleThumbActive]} />
          </Pressable>
        </View>
      </View>

      <View style={styles.subscriptionCard}>
        <View style={styles.recordTitleRow}>
          <Text style={styles.cardTitle}>Estado de la cuenta</Text>
          <Text style={styles.recordPill}>{subscriptionStatus || 'trial'}</Text>
        </View>
        <Text style={styles.cardText}>
          {trialEndsAt
            ? `Periodo de prueba hasta ${new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(new Date(trialEndsAt))}.`
            : 'La cuenta esta vinculada al portal y al panel administrativo.'}
        </Text>
      </View>

      <View style={styles.updateCard}>
        <View style={styles.updateCardHeader}>
          <View style={styles.updateCardIcon}>
            <Ionicons name="phone-portrait-outline" size={21} color="#d4ab4e" />
          </View>
          <View style={styles.updateCardCopy}>
            <Text style={styles.cardTitle}>Actualizaciones de la app</Text>
            <Text style={styles.cardText}>Version instalada: {appVersion} ({appBuild})</Text>
          </View>
        </View>
        <Text style={styles.cardText}>
          La aplicacion revisa nuevas versiones al abrirse y periodicamente mientras esta en uso.
        </Text>
        {Boolean(updateMessage) && <Text style={styles.updateStatusText}>{updateMessage}</Text>}
        <View style={styles.updateActions}>
          <Pressable
            style={[styles.secondaryActionCompact, styles.updateAction]}
            onPress={onCheckForUpdates}
            disabled={checkingUpdate}
          >
            {checkingUpdate ? (
              <ActivityIndicator color="#1d4ed8" />
            ) : (
              <>
                <Ionicons name="refresh-outline" size={18} color="#1d4ed8" />
                <Text style={styles.secondaryActionCompactText}>Buscar actualizacion</Text>
              </>
            )}
          </Pressable>
          {availableUpdate && (
            <Pressable style={[styles.primaryAction, styles.updateAction]} onPress={onInstallUpdate}>
              <Text style={styles.primaryActionText}>Instalar {availableUpdate.version}</Text>
              <Ionicons name="download-outline" size={18} color="#ffffff" />
            </Pressable>
          )}
        </View>
      </View>

      <CompactList items={['Cambiar contrasena', 'Anadir telefono', 'Cambiar correo', 'Enviar reporte']} />
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
    paddingVertical: 22,
  },
  authScreen: {
    flex: 1,
    overflow: 'hidden',
  },
  authHaloTop: {
    position: 'absolute',
    top: -110,
    right: -95,
    width: 260,
    height: 260,
    borderWidth: 32,
    borderColor: 'rgba(255,255,255,0.13)',
    borderRadius: 130,
  },
  authHaloBottom: {
    position: 'absolute',
    bottom: -150,
    left: -100,
    width: 310,
    height: 310,
    borderWidth: 38,
    borderColor: 'rgba(255,255,255,0.16)',
    borderRadius: 155,
  },
  authModernContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 28,
  },
  authModernShell: {
    width: '100%',
    maxWidth: 500,
    alignSelf: 'center',
  },
  authModernBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 40,
  },
  authBrandMark: {
    width: 45,
    height: 45,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    borderRadius: 8,
    backgroundColor: 'rgba(7,21,38,0.55)',
  },
  authModernLogo: {
    width: 34,
    height: 34,
  },
  authBrandName: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '900',
  },
  authBrandCaption: {
    marginTop: 1,
    color: '#f4d98a',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  authModernIntro: {
    marginBottom: 25,
  },
  authEyebrow: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(212,171,78,0.52)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: 'rgba(7,21,38,0.28)',
  },
  authEyebrowText: {
    color: '#f8e7ad',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  authModernTitle: {
    marginTop: 14,
    color: '#ffffff',
    fontSize: 32,
    fontWeight: '900',
    lineHeight: 38,
  },
  authModernSubtitle: {
    maxWidth: 390,
    marginTop: 8,
    color: '#dbeafe',
    fontSize: 14,
    lineHeight: 21,
  },
  authModernCard: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.74)',
    borderRadius: 8,
    padding: 21,
    backgroundColor: 'rgba(255,255,255,0.97)',
    shadowColor: '#071526',
    shadowOpacity: 0.22,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  authErrorNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 6,
    marginBottom: 14,
    padding: 10,
    backgroundColor: '#fff1f2',
  },
  authErrorText: {
    flex: 1,
    color: '#991b1b',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
  },
  authSuccessNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 6,
    marginBottom: 14,
    padding: 10,
    backgroundColor: '#eff6ff',
  },
  authSuccessText: {
    flex: 1,
    color: '#1e3a8a',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
  },
  authFormTitle: {
    color: '#0f172a',
    fontSize: 24,
    fontWeight: '900',
  },
  authFormHint: {
    marginTop: 5,
    marginBottom: 20,
    color: '#64748b',
    fontSize: 13,
    lineHeight: 19,
  },
  authModernLabel: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '900',
    marginBottom: 8,
  },
  authInputShell: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 8,
    marginBottom: 16,
    paddingHorizontal: 13,
    backgroundColor: '#ffffff',
  },
  authModernInput: {
    flex: 1,
    minWidth: 0,
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '600',
  },
  authRecoveryLink: {
    alignSelf: 'flex-start',
    marginTop: -4,
    marginBottom: 16,
  },
  authRecoveryText: {
    color: '#1d4ed8',
    fontSize: 12,
    fontWeight: '900',
  },
  authModernPrimary: {
    minHeight: 53,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderRadius: 8,
    backgroundColor: '#1d4ed8',
    shadowColor: '#1d4ed8',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  authModernPrimaryPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.985 }],
  },
  authModernDisabled: {
    opacity: 0.55,
  },
  authModernPrimaryText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
  },
  authModernDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginVertical: 19,
  },
  authModernDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e2e8f0',
  },
  authModernDividerText: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '800',
  },
  authPortalButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 8,
    backgroundColor: '#f8fbff',
  },
  authPortalButtonPressed: {
    backgroundColor: '#eff6ff',
  },
  authPortalButtonText: {
    color: '#1d4ed8',
    fontSize: 13,
    fontWeight: '900',
  },
  authSwitchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 22,
  },
  authSwitchText: {
    color: '#64748b',
    fontSize: 13,
  },
  authSwitchLink: {
    color: '#1d4ed8',
    fontSize: 13,
    fontWeight: '900',
  },
  authTrustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 19,
    paddingHorizontal: 12,
  },
  authTrustText: {
    color: '#e6efff',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
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
    width: '90%',
    maxWidth: 460,
    alignSelf: 'center',
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
  updateBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
    paddingHorizontal: 14,
    paddingVertical: 11,
    backgroundColor: '#172033',
  },
  updateBannerIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 6,
    backgroundColor: '#243042',
  },
  updateBannerCopy: {
    flex: 1,
    minWidth: 0,
  },
  updateBannerTitle: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '900',
  },
  updateBannerText: {
    marginTop: 2,
    color: '#cbd5e1',
    fontSize: 11,
    lineHeight: 16,
  },
  updateBannerButton: {
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    paddingHorizontal: 13,
    backgroundColor: '#d4ab4e',
  },
  updateBannerButtonText: {
    color: '#0c1424',
    fontSize: 12,
    fontWeight: '900',
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
  attachmentShareButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 6,
    backgroundColor: '#ffffff',
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
  updateCard: {
    gap: 12,
    borderWidth: 1,
    borderColor: '#d9c57d',
    borderRadius: 6,
    padding: 14,
    backgroundColor: '#fffdf5',
  },
  updateCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  updateCardIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#ead999',
    borderRadius: 6,
    backgroundColor: '#0c1424',
  },
  updateCardCopy: {
    flex: 1,
  },
  updateStatusText: {
    borderLeftWidth: 3,
    borderLeftColor: '#d4ab4e',
    paddingLeft: 10,
    color: '#475569',
    fontSize: 13,
    lineHeight: 19,
  },
  updateActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  updateAction: {
    minWidth: 150,
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
  loadingPlainScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 15,
    padding: 24,
    backgroundColor: '#f8fafc',
  },
  loadingPlainText: {
    color: '#334155',
    fontSize: 15,
    fontWeight: '800',
  },
  blockedScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 28,
    backgroundColor: '#f8fafc',
  },
  blockedTitle: {
    color: '#0f172a',
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
  },
  blockedText: {
    maxWidth: 520,
    color: '#475569',
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center',
  },
  blockedMeta: {
    color: '#be123c',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  biometricScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 28,
  },
  biometricTitle: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
  },
  biometricText: {
    maxWidth: 420,
    color: '#cbd5e1',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  biometricButton: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderRadius: 6,
    marginTop: 8,
    paddingHorizontal: 20,
    backgroundColor: '#d4ab4e',
  },
  biometricButtonText: {
    color: '#0c1424',
    fontSize: 15,
    fontWeight: '900',
  },
  despachoSelector: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#243042',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#111c2d',
  },
  despachoSelectorIcon: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#665628',
    borderRadius: 6,
    backgroundColor: '#172033',
  },
  despachoSelectorCopy: {
    flex: 1,
    minWidth: 0,
  },
  despachoSelectorLabel: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  despachoSelectorName: {
    marginTop: 2,
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '900',
  },
  offlineBanner: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#fecaca',
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: '#fef2f2',
  },
  offlineBannerText: {
    flex: 1,
    color: '#7f1d1d',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
  },
  bottomBar: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'stretch',
    borderTopWidth: 1,
    borderTopColor: '#cbd5e1',
    paddingBottom: Platform.OS === 'ios' ? 12 : 4,
    backgroundColor: '#ffffff',
  },
  bottomItemSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  bottomItem: {
    width: '100%',
    minHeight: 62,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    borderTopWidth: 2,
    borderTopColor: 'transparent',
  },
  bottomItemMiddle: {
    paddingTop: 23,
  },
  bottomItemActive: {
    borderTopColor: '#1d4ed8',
    backgroundColor: '#f8fafc',
  },
  bottomItemText: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '800',
  },
  bottomItemTextActive: {
    color: '#1d4ed8',
  },
  quickActionButton: {
    position: 'absolute',
    top: -23,
    zIndex: 3,
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 5,
    borderColor: '#f1f5f9',
    borderRadius: 27,
    backgroundColor: '#d4ab4e',
    shadowColor: '#0f172a',
    shadowOpacity: 0.22,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 },
  },
  mobileQuickActionHero: {
    minHeight: 86,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 6,
    padding: 14,
    backgroundColor: '#0c1424',
  },
  mobileQuickActionIcon: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    backgroundColor: '#d4ab4e',
  },
  mobileQuickActionCopy: {
    flex: 1,
  },
  mobileQuickActionTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
  },
  mobileQuickActionText: {
    marginTop: 4,
    color: '#cbd5e1',
    fontSize: 12,
    lineHeight: 17,
  },
  agendaPreview: {
    borderWidth: 1,
    borderColor: '#dbeafe',
    borderRadius: 6,
    padding: 14,
    backgroundColor: '#ffffff',
  },
  agendaPreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
  },
  linkText: {
    color: '#1d4ed8',
    fontSize: 12,
    fontWeight: '900',
  },
  agendaEmptyText: {
    color: '#64748b',
    fontSize: 13,
    lineHeight: 19,
  },
  agendaPreviewRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingVertical: 10,
  },
  agendaPreviewDate: {
    width: 44,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    backgroundColor: '#eff6ff',
  },
  agendaPreviewDay: {
    color: '#1e40af',
    fontSize: 18,
    fontWeight: '900',
  },
  agendaPreviewMonth: {
    color: '#1e40af',
    fontSize: 10,
    fontWeight: '900',
  },
  agendaPreviewCopy: {
    flex: 1,
  },
  recordTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  recordTimestamp: {
    marginTop: 10,
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
  },
  recordPressable: {
    gap: 1,
  },
  recordDetails: {
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    marginTop: 12,
    paddingTop: 12,
  },
  detailSectionTitle: {
    color: '#1e40af',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  detailRow: {
    borderLeftWidth: 3,
    borderLeftColor: '#bfdbfe',
    paddingLeft: 10,
  },
  detailRowTitle: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '900',
  },
  detailRowText: {
    marginTop: 3,
    color: '#475569',
    fontSize: 12,
    lineHeight: 17,
  },
  detailRowMeta: {
    marginTop: 4,
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '800',
  },
  calendarActions: {
    gap: 7,
  },
  audienceRecommendation: {
    marginTop: 6,
    color: '#1e40af',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
  },
  audienceTip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 6,
    marginBottom: 14,
    padding: 11,
    backgroundColor: '#eff6ff',
  },
  audienceTipText: {
    flex: 1,
    color: '#1e3a8a',
    fontSize: 12,
    lineHeight: 18,
  },
  twoColumnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  twoColumnField: {
    flex: 1,
  },
  miniDangerButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 6,
    backgroundColor: '#fef2f2',
  },
  moneyRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  moneyCell: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 6,
    padding: 10,
    backgroundColor: '#f8fafc',
  },
  moneyLabel: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  moneyValue: {
    marginTop: 5,
    color: '#166534',
    fontSize: 16,
    fontWeight: '900',
  },
  moneyValueDue: {
    color: '#be123c',
  },
  segmentRow: {
    gap: 8,
  },
  segmentButton: {
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 6,
    paddingHorizontal: 13,
    backgroundColor: '#ffffff',
  },
  segmentButtonActive: {
    borderColor: '#1d4ed8',
    backgroundColor: '#1d4ed8',
  },
  segmentButtonText: {
    color: '#1d4ed8',
    fontSize: 12,
    fontWeight: '900',
  },
  segmentButtonTextActive: {
    color: '#ffffff',
  },
  toggleRow: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderWidth: 1,
    borderColor: '#dbeafe',
    borderRadius: 6,
    marginBottom: 14,
    padding: 12,
    backgroundColor: '#f8fafc',
  },
  toggleTrack: {
    width: 48,
    height: 28,
    justifyContent: 'center',
    borderRadius: 14,
    paddingHorizontal: 3,
    backgroundColor: '#cbd5e1',
  },
  toggleTrackActive: {
    backgroundColor: '#1d4ed8',
  },
  toggleThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#ffffff',
  },
  toggleThumbActive: {
    alignSelf: 'flex-end',
  },
  moreGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  moreCard: {
    width: '48%',
    minHeight: 142,
    borderWidth: 1,
    borderColor: '#dbeafe',
    borderRadius: 6,
    padding: 13,
    backgroundColor: '#ffffff',
  },
  moreIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    marginBottom: 12,
    backgroundColor: '#eff6ff',
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(2, 6, 23, 0.62)',
  },
  bottomSheet: {
    maxHeight: '86%',
    gap: 9,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 28 : 18,
    backgroundColor: '#ffffff',
  },
  sheetHandle: {
    width: 44,
    height: 4,
    alignSelf: 'center',
    borderRadius: 2,
    marginBottom: 5,
    backgroundColor: '#cbd5e1',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 4,
  },
  sheetTitle: {
    color: '#0f172a',
    fontSize: 21,
    fontWeight: '900',
  },
  sheetSubtitle: {
    marginTop: 3,
    color: '#64748b',
    fontSize: 12,
  },
  sheetAction: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 6,
    padding: 11,
    backgroundColor: '#ffffff',
  },
  sheetActionActive: {
    borderColor: '#86efac',
    backgroundColor: '#f0fdf4',
  },
  sheetActionIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    backgroundColor: '#eff6ff',
  },
  sheetActionCopy: {
    flex: 1,
  },
  datePickerButton: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    marginBottom: 14,
    paddingHorizontal: 13,
    backgroundColor: '#ffffff',
  },
  datePickerText: {
    flex: 1,
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '700',
  },
  securityCard: {
    borderWidth: 1,
    borderColor: '#dbeafe',
    borderRadius: 6,
    padding: 14,
    backgroundColor: '#ffffff',
  },
  securityCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  securityIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    backgroundColor: '#eff6ff',
  },
  securityCopy: {
    flex: 1,
  },
  subscriptionCard: {
    borderWidth: 1,
    borderColor: '#d9c57d',
    borderRadius: 6,
    padding: 14,
    backgroundColor: '#fffdf5',
  },
});
