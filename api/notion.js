// api/notion.js — Boro Travel Atelier

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

const DS = {
  viajes:      '1f3b15ed803344f487af2c9a78f34bc1',
  ciudades:    '8efc1160319945f3a26f3f68169e7e72',
  vouchers:    '569701796088438aa534350c0597bbd0',
  excursiones: 'a4f2d191931a4cc6956e62234562af47',
};

async function notionRequest(path, method = 'GET', body = null) {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error('NOTION_TOKEN no configurado');
  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
  };
  if (body) options.body = JSON.stringify(body);
  const res = await fetch(`${NOTION_API}${path}`, options);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Notion API error ${res.status}: ${err}`);
  }
  return res.json();
}

function getProp(props, name) {
  const p = props[name];
  if (!p) return null;
  switch (p.type) {
    case 'title':        return p.title?.map(t => t.plain_text).join('') || null;
    case 'rich_text':    return p.rich_text?.map(t => t.plain_text).join('') || null;
    case 'email':        return p.email || null;
    case 'phone_number': return p.phone_number || null;
    case 'url':          return p.url || null;
    case 'number':       return p.number ?? null;
    case 'checkbox':     return p.checkbox;
    case 'select':       return p.select?.name || null;
    case 'multi_select': return p.multi_select?.map(o => o.name) || [];
    case 'date':         return p.date?.start || null;
    case 'relation':     return p.relation?.map(r => r.id) || [];
    default:             return null;
  }
}

async function getViajeByEmail(email) {
  const emailClean = email.trim().toLowerCase();

  const data = await notionRequest(`/databases/${DS.viajes}/query`, 'POST', {
    filter: {
      property: 'App activa',
      checkbox: { equals: true }
    }
  });

  if (!data.results?.length) return null;

  const match = data.results.find(page => {
    const emailProp = getProp(page.properties, 'Email Cliente');
    return emailProp && emailProp.trim().toLowerCase() === emailClean;
  });

  if (!match) return null;

  const p = match.properties;
  return {
    id:           match.id,
    nombre:       getProp(p, 'Nombre del viaje'),
    cliente:      getProp(p, 'Cliente'),
    slug:         getProp(p, 'Slug'),
    fechaSalida:  getProp(p, 'Fecha de salida'),
    fechaRegreso: getProp(p, 'Fecha de regreso'),
    aerolinea:    getProp(p, 'Aerolínea'),
    vueloIda:     getProp(p, 'Vuelo de ida'),
    vueloRegreso: getProp(p, 'Vuelo de regreso'),
    traslados:    getProp(p, 'Traslados'),
    ciudadesIds:  getProp(p, 'Ciudades') || [],
  };
}

async function getCiudades(ids) {
  if (!ids.length) return [];
  const results = await Promise.all(ids.map(id => notionRequest(`/pages/${id}`)));
  return results.map(page => {
    const p = page.properties;
    return {
      id:               page.id,
      ciudad:           getProp(p, 'Ciudad'),
      pais:             getProp(p, 'País'),
      orden:            getProp(p, 'Orden') ?? 99,
      hotel:            getProp(p, 'Hotel'),
      direccionHotel:   getProp(p, 'Dirección hotel'),
      linkMaps:         getProp(p, 'Link Maps'),
      checkIn:          getProp(p, 'Check in') || '15:00',
      checkOut:         getProp(p, 'Check out') || '10:00',
      fechaLlegada:     getProp(p, 'Fecha de llegada'),
      fechaSalida:      getProp(p, 'Fecha de salida'),
      vueloIda:         getProp(p, 'Vuelo ida'),
      vueloVuelta:      getProp(p, 'Vuelo vuelta'),
      horaVueloIda:     getProp(p, 'Hora vuelo ida'),
      horaVueloRegreso: getProp(p, 'Hora vuelo regreso'),
      traslados:        getProp(p, 'Traslados') || [],
      fotoPortada:      getProp(p, 'Foto portada'),
      guiaDestino:      getProp(p, 'Guía de destino'),
      vouchersIds:      getProp(p, 'Vouchers') || [],
    };
  }).sort((a, b) => a.orden - b.orden);
}

async function getVouchers(ids) {
  if (!ids.length) return [];
  const results = await Promise.all(ids.map(id => notionRequest(`/pages/${id}`)));
  return results.map(page => {
    const p = page.properties;
    return {
      id:          page.id,
      nombre:      getProp(p, 'Nombre del voucher'),
      tipo:        getProp(p, 'Tipo'),
      descripcion: getProp(p, 'Descripción'),
      linkVoucher: getProp(p, 'Link voucher'),
      orden:       getProp(p, 'Orden') ?? 99,
    };
  }).sort((a, b) => a.orden - b.orden);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, email, ciudadesIds, vouchersIds } = req.body || {};

  try {
    switch (action) {
      case 'getViaje': {
        if (!email) return res.status(400).json({ error: 'Email requerido' });
        const viaje = await getViajeByEmail(email);
        if (!viaje) return res.status(404).json({ error: 'no_encontrado' });
        return res.status(200).json(viaje);
      }
      case 'getCiudades': {
        if (!ciudadesIds?.length) return res.status(200).json([]);
        const ciudades = await getCiudades(ciudadesIds);
        return res.status(200).json(ciudades);
      }
      case 'getVouchers': {
        if (!vouchersIds?.length) return res.status(200).json([]);
        const vouchers = await getVouchers(vouchersIds);
        return res.status(200).json(vouchers);
      }
      default:
        return res.status(400).json({ error: 'Acción no reconocida' });
    }
  } catch (err) {
    console.error('Error Notion API:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
