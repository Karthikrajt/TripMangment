import { ShareWhatsApp } from '../components/ShareWhatsApp';
import { liveText, pickupText } from '../domain/share';
import { personIdOf } from '../domain/people';
import { Link } from 'react-router-dom';
import { Bus, CalendarDays, Hotel, Megaphone, MessagesSquare, Phone, Receipt, ShieldAlert, Ticket, Train, BedDouble, ListChecks, UserCheck, Video } from 'lucide-react';
import { useSession } from '../store/session';
import { berthLabel, passengersOf } from '../domain/ticketPassengers';
import { useAccommodations, useAnnouncements, useItinerary, useRooms, useTickets, useTransport } from '../hooks/data';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { ButtonLink } from '../components/ui/Button';
import { CallButton, MapButton, AddressLine } from '../components/Links';
import { ItineraryRow } from '../components/ItineraryList';
import { LastSynced } from '../components/ui/PageHeader';
import { todaysItems, upcomingItems, tripPhase } from '../domain/tripTime';
import { formatDate, formatDateLong, formatTime, telHref, todayIST } from '../lib/format';

/** One-screen, big-button view for use during the trip. Works from cached data offline. */
export default function Live() {
  const { trip, member, members } = useSession();
  const itinerary = useItinerary();
  const tickets = useTickets();
  const hotels = useAccommodations();
  const rooms = useRooms();
  const transport = useTransport();
  const announcements = useAnnouncements(2);
  const today = todayIST();
  const phase = trip ? tripPhase(trip.startDate, trip.endDate) : null;

  const items = todaysItems(itinerary.data);
  const schedule = items.length ? items : upcomingItems(itinerary.data, 3);
  const myTickets = tickets.data.filter((t) => member && t.passengerUids.includes(personIdOf(member)));
  const nextTicket = (myTickets.length ? myTickets : tickets.data).find((t) => t.journeyDate >= today);
  const hotel = hotels.data.find((h) => h.checkInDate <= today && h.checkOutDate >= today) ?? hotels.data.find((h) => h.checkOutDate >= today) ?? hotels.data[0];
  const myRoom = rooms.data.find((r) => member && r.memberUids.includes(personIdOf(member)));
  const vehicle = transport.data.find((v) => member && v.memberUids.includes(personIdOf(member)) && v.pickupDate >= today) ?? transport.data.find((v) => v.pickupDate >= today) ?? transport.data[0];
  const admins = members.filter((m) => m.status === 'approved' && m.role === 'admin' && m.phone);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-sm font-semibold uppercase text-brand-700">Trip Live{phase?.phase === 'during' ? ` · Day ${phase.dayNumber}` : ''}</p>
          <h1 className="text-2xl font-bold">{formatDateLong(today)}</h1>
          <LastSynced syncKey="itinerary" />
        </div>
        <ShareWhatsApp size="sm" label="Share today" text={() => liveText({ tripName: trip?.name ?? 'Trip', date: items.length ? today : schedule[0]?.date ?? today, items: schedule, hotel, vehicle: vehicle && vehicle.pickupDate >= today ? vehicle : undefined })} />
      </div>

      {announcements.data[0] && (
        <Link to="/announcements" className={`block rounded-2xl border p-4 ${announcements.data[0].priority === 'important' ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'}`}>
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-800"><Megaphone className="size-4" /> Latest announcement</p>
          <p className="font-semibold">{announcements.data[0].title}</p>
          <p className="line-clamp-2 text-slate-700">{announcements.data[0].body}</p>
        </Link>
      )}

      <Card>
        <CardHeader icon={<CalendarDays className="size-5" />} title={items.length ? "Today's plan" : 'Coming up'} action={<Link to="/itinerary" className="text-sm font-semibold text-brand-700">All</Link>} />
        <CardBody>
          {schedule.length ? <ul className="space-y-1">{schedule.map((i) => <ItineraryRow key={i.id} item={i} />)}</ul> : <p className="text-slate-500">Nothing scheduled.</p>}
        </CardBody>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader icon={<Train className="size-5" />} title={myTickets.length ? 'My next train' : 'Next train'} />
          <CardBody className="space-y-2">
            {nextTicket ? (
              <>
                <p className="text-lg font-semibold">{nextTicket.trainName} #{nextTicket.trainNumber}</p>
                <p className="text-xl font-bold">{nextTicket.boardingStation} → {nextTicket.destinationStation}</p>
                <p>{formatDate(nextTicket.journeyDate)} · Departs {formatTime(nextTicket.departureTime)}</p>
                <p className="font-mono text-lg">PNR {nextTicket.pnr}</p>
                {(() => {
                  const mine = passengersOf(nextTicket, (id) => members.find((m) => m.uid === id)?.displayName ?? '').find((p) => p.personId === personIdOf(member));
                  const seat = mine ? berthLabel(mine) : [nextTicket.coach, nextTicket.seats].filter(Boolean).join(' ');
                  return seat ? <p className="text-lg">{mine ? 'Your berth' : 'Seats'}: <b className="font-mono">{seat}</b>{mine?.status && <span className="ml-2 text-sm font-semibold text-emerald-700">{mine.status}</span>}</p> : null;
                })()}
              </>
            ) : <p className="text-slate-500">No upcoming train.</p>}
            <ButtonLink to="/tickets" size="lg" className="w-full" icon={<Ticket className="size-5" />}>Open tickets</ButtonLink>
          </CardBody>
        </Card>

        <Card>
          <CardHeader icon={<Bus className="size-5" />} title="Pickup & driver" />
          <CardBody className="space-y-2">
            {vehicle ? (
              <>
                <p className="text-lg font-semibold">{vehicle.vehicleType} {vehicle.registrationNumber}</p>
                <p className="text-xl font-bold">{formatTime(vehicle.pickupTime)} <span className="text-base font-normal text-slate-600">{formatDate(vehicle.pickupDate)}</span></p>
                <p>{vehicle.pickupLocation}</p>
                {vehicle.driverName && <p>Driver: <b>{vehicle.driverName}</b></p>}
                <div className="flex flex-wrap gap-2">
                  <CallButton phone={vehicle.driverPhone} label="Call driver" />
                  <MapButton url={vehicle.mapsUrl} address={vehicle.mapsUrl ? undefined : vehicle.pickupLocation} label="Navigate" />
                  <ShareWhatsApp text={() => pickupText(vehicle, vehicle.memberUids.map((id) => members.find((m) => m.uid === id)?.displayName ?? '').filter(Boolean))} label="Share" />
                </div>
              </>
            ) : <p className="text-slate-500">No transport added.</p>}
          </CardBody>
        </Card>

        <Card>
          <CardHeader icon={<Hotel className="size-5" />} title="Hotel" />
          <CardBody className="space-y-2">
            {hotel ? (
              <>
                <p className="text-lg font-semibold">{hotel.name}</p>
                <AddressLine address={hotel.address} />
                {myRoom && <p className="flex items-center gap-2 rounded-xl bg-brand-50 px-3 py-2 text-brand-900"><BedDouble className="size-5" /> Your room: <b className="text-xl">{myRoom.name}</b></p>}
                <div className="flex flex-wrap gap-2">
                  <MapButton url={hotel.mapsUrl} address={hotel.address} />
                  <CallButton phone={hotel.contactNumber} label="Call hotel" />
                </div>
              </>
            ) : <p className="text-slate-500">No hotel added.</p>}
          </CardBody>
        </Card>

        <Card className="border-red-200">
          <CardHeader icon={<ShieldAlert className="size-5 text-red-600" />} title="Emergency & contacts" />
          <CardBody className="space-y-3">
            {trip?.emergencyInfo && <p className="whitespace-pre-line rounded-xl bg-red-50 p-3 text-red-900">{trip.emergencyInfo}</p>}
            <ul className="space-y-2">
              {(trip?.importantContacts ?? []).map((c, i) => (
                <li key={i} className="flex items-center justify-between gap-2">
                  <span><b>{c.name}</b>{c.note && <span className="text-sm text-slate-500"> · {c.note}</span>}</span>
                  <a href={telHref(c.phone)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white"><Phone className="size-4" /> {c.phone}</a>
                </li>
              ))}
              {admins.map((a) => (
                <li key={a.uid} className="flex items-center justify-between gap-2">
                  <span><b>{a.displayName}</b> <span className="text-sm text-slate-500">· Trip admin</span></span>
                  <a href={telHref(a.phone)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white"><Phone className="size-4" /> Call</a>
                </li>
              ))}
              <li className="flex items-center justify-between gap-2">
                <span><b>Emergency (police/ambulance/fire)</b></span>
                <a href="tel:112" className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white"><Phone className="size-4" /> 112</a>
              </li>
            </ul>
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <ButtonLink to="/call" size="lg" variant="secondary" className="col-span-2" icon={<Video className="size-5" />}>Video call</ButtonLink>
        <ButtonLink to="/checklist" size="lg" variant="secondary" icon={<UserCheck className="size-5" />}>Roll call</ButtonLink>
        <ButtonLink to="/checklist" size="lg" variant="secondary" icon={<ListChecks className="size-5" />}>Checklist</ButtonLink>
        <ButtonLink to="/chat" size="lg" variant="secondary" icon={<MessagesSquare className="size-5" />}>Group chat</ButtonLink>
        <ButtonLink to="/expenses/new" size="lg" variant="secondary" icon={<Receipt className="size-5" />}>Add expense</ButtonLink>
      </div>
    </div>
  );
}
