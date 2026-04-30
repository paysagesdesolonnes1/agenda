const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const BREVO_KEY    = process.env.BREVO_KEY;
const EMAIL_DEST   = process.env.EMAIL_DEST;
const DELAI_JOURS  = 21;

const MOIS = ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];

async function run() {
  const h = { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY };

  const [clients, interventions] = await Promise.all([
    fetch(SUPABASE_URL + '/rest/v1/clients?select=*', { headers: h }).then(r => r.json()),
    fetch(SUPABASE_URL + '/rest/v1/interventions?select=*', { headers: h }).then(r => r.json()),
  ]);

  const aujourd_hui = new Date();
  aujourd_hui.setHours(0, 0, 0, 0);

  const aRelancer = [];

  clients.forEach(client => {
    if (!client.entretien) return;

    const ivsClient = interventions.filter(iv =>
      iv.client_id === client.id && iv.statut !== 'annule'
    );

    // Déjà une visite future planifiée → ok
    if (ivsClient.some(iv => new Date(iv.date) > aujourd_hui)) return;

    const passees = ivsClient
      .filter(iv => new Date(iv.date) <= aujourd_hui)
      .sort((a, b) => b.date.localeCompare(a.date));

    const derniere  = passees[0];
    const joursDepuis = derniere
      ? Math.floor((aujourd_hui - new Date(derniere.date)) / 86400000)
      : null;

    if (joursDepuis === null || joursDepuis >= DELAI_JOURS) {
      aRelancer.push({ client, derniere, joursDepuis });
    }
  });

  if (!aRelancer.length) {
    console.log('Aucun entretien à relancer.');
    return;
  }

  aRelancer.sort((a, b) => (b.joursDepuis ?? 999) - (a.joursDepuis ?? 999));

  const lignes = aRelancer.map(({ client, derniere, joursDepuis }) => {
    const nom   = client.nom + (client.prenom ? ' ' + client.prenom : '');
    const ville = client.ville ? `<br><span style="color:#888;font-size:12px">${client.ville}</span>` : '';
    let dateStr = 'Jamais';
    if (derniere) {
      const d = new Date(derniere.date + 'T00:00:00');
      dateStr = `${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`;
    }
    const delaiStr   = joursDepuis !== null ? `${joursDepuis} jours` : '–';
    const bgRow      = joursDepuis > 35 ? '#FCEBEB' : '#ffffff';
    const colorDelai = joursDepuis > 35 ? '#A32D2D' : '#854F0B';
    return `
      <tr style="background:${bgRow}">
        <td style="padding:9px 12px;border-bottom:1px solid #eee"><strong>${nom}</strong>${ville}</td>
        <td style="padding:9px 12px;border-bottom:1px solid #eee">${dateStr}</td>
        <td style="padding:9px 12px;border-bottom:1px solid #eee;font-weight:700;color:${colorDelai}">${delaiStr}</td>
      </tr>`;
  }).join('');

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#EAF3DE;padding:16px 20px;border-radius:10px 10px 0 0;border-bottom:3px solid #639922">
        <h2 style="margin:0;color:#3B6D11">🌿 Entretiens à planifier</h2>
        <p style="margin:6px 0 0;color:#5c7c32;font-size:13px">
          ${aRelancer.length} client(s) sans visite depuis plus de ${DELAI_JOURS} jours et sans rendez-vous planifié.
        </p>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr style="background:#f4f5f7;color:#5F5E5A;font-size:11px;text-transform:uppercase">
          <th style="padding:8px 12px;text-align:left">Client</th>
          <th style="padding:8px 12px;text-align:left">Dernière visite</th>
          <th style="padding:8px 12px;text-align:left">Délai</th>
        </tr>
        ${lignes}
      </table>
      <p style="padding:12px 20px;color:#aaa;font-size:11px">
        Envoyé automatiquement par Paysages des Olonnes — chaque lundi matin
      </p>
    </div>`;

  const reponseBrevo = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': BREVO_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender:      { name: 'Paysages des Olonnes', email: EMAIL_DEST },
      to:          [{ email: EMAIL_DEST }],
      subject:     `🌿 ${aRelancer.length} entretien(s) à planifier — ${new Date().toLocaleDateString('fr-FR')}`,
      htmlContent: html
    })
  });

  if (!reponseBrevo.ok) {
    const erreur = await reponseBrevo.text();
    console.error(`❌ Brevo a refusé l'envoi :`, erreur);
  } else {
    console.log(`✅ Email envoyé avec succès pour ${aRelancer.length} client(s).`);
  }
}

run().catch(e => { console.error(e); process.exit(1); });
