import { personIdOf, peopleOf, headCount, ageSummary } from '../domain/people';
import { CalendarDays, Hotel, Bus, Receipt, MessagesSquare, Ticket, Megaphone, Activity, Users, Train, UserCheck, ClipboardCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSession, useIsAdmin, useShareDefaults } from '../store/session';
import { useAccommodations, useAnnouncements, useExpenses, useItinerary, useTickets, useTransport } from '../hooks/data';
import { Card, CardBody, CardHeader, QuickCard, Stat } from '../components/ui/Card';
import { EmptyState, Notice } from '../components/ui/Feedback';
import { ItineraryRow } from '../components/ItineraryList';
import { tripPhase, todaysItems, upcomingItems } from '../domain/tripTime';
import { formatDate, formatDateLong, formatTime, timeAgo, todayIST } from '../lib/format';
import { formatINR, sumPaise } from '../domain/money';
import { MapButton, CallButton } from '../components/Links';
import { LastSynced } from '../components/ui/PageHeader';

export default function Dashboard() {
  const { trip, members, notifications, member } = useSession();
  const admin = useIsAdmin();
  const itinerary = useItinerary();
  const expenses = useExpenses();
  const tickets = useTickets();
  const hotels = useAccommodations();
  const transport = useTransport();
  const announcements = useAnnouncements(3);

  const approved = peopleOf(members);
  const heads = headCount(approved, useShareDefaults());
  const pending = members.filter((m) => m.status === 'pending');
  const approvedExpenses = expenses.data.filter((e) => e.status === 'approved');
  const total = sumPaise(approvedExpenses.map((e) => e.amountPaise));
  const pendingReview = expenses.data.filter((e) => e.status === 'pending').length;
  const phase = trip ? tripPhase(trip.startDate, trip.endDate) : { phase: 'unknown' as const };
  const today = todaysItems(itinerary.data);
  const upcoming = upcomingItems(itinerary.data, 4);
  const todayIso = todayIST();
  const nextTicket = tickets.data.find((t) => t.journeyDate >= todayIso) ?? tickets.data[0];
  const myTickets = tickets.data.filter((t) => member && t.passengerUids.includes(personIdOf(member))).length;
  const hotel = hotels.data.find((h) => h.checkOutDate >= todayIso) ?? hotels.data[0];
  const vehicle = transport.data.find((v) => v.pickupDate >= todayIso) ?? transport.data[0];

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 to-brand-800 p-6 text-white shadow-md sm:p-8">
        <p className="text-brand-100">{admin ? 'Admin dashboard' : `Hello, ${member?.displayName.split(' ')[0] ?? ''} 👋`}</p>
        <h1 className="mt-1 text-2xl font-bold sm:text-3xl">{trip?.name}</h1>
        <p className="mt-1 text-lg text-brand-100">
          {trip?.destination} · {formatDate(trip?.startDate)} to {formatDate(trip?.endDate)}
        </p>
        <div className="mt-5 inline-flex items-center gap-3 rounded-2xl bg-white/15 px-4 py-3">
          {phase.phase === 'before' && (
            <>
              <span className="text-4xl font-bold tabular-nums">{phase.daysToGo}</span>
              <span className="text-lg leading-tight">{phase.daysToGo === 1 ? 'day' : 'days'} to go</span>
            </>
          )}
          {phase.phase === 'during' && (
            <>
              <span className="text-4xl font-bold">Day {phase.dayNumber}</span>
              <span className="text-lg leading-tight">of {phase.totalDays} · Have a great trip!</span>
            </>
          )}
          {phase.phase === 'after' && <span className="text-lg">Trip completed – hope you had fun! 🎉</span>}
          {phase.phase === 'unknown' && <span className="text-lg">Dates not set yet</span>}
        </div>
        <div className="mt-3"><span className="text-brand-100 [&_p]:text-brand-100"><LastSynced syncKey="trip" /></span></div>
      </section>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="People" value={approved.length} hint={<Link className="text-brand-700 font-semibold" to="/members">{ageSummary(approved)}</Link>} />
        {admin ? (
          <Stat label="Pending approvals" value={pending.length} hint={pending.length ? <Link className="text-brand-700 font-semibold" to="/admin/approvals">Review now</Link> : 'All caught up'} />
        ) : (
          <Stat label="My tickets" value={myTickets} hint={<Link className="text-brand-700 font-semibold" to="/tickets">Open tickets</Link>} />
        )}
        <Stat label="Total trip expenses" value={formatINR(total)} hint="Approved only" />
        <Stat label="Per head (adult)" value={formatINR(heads ? Math.round(total / heads) : 0)} hint={`${heads} full shares · infants free`} />
      </div>

      {admin && (pending.length > 0 || pendingReview > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {pending.length > 0 && (
            <Link to="/admin/approvals" className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
              <UserCheck className="size-6" /> <span className="font-semibold">{pending.length} member request(s) waiting</span>
            </Link>
          )}
          {pendingReview > 0 && (
            <Link to="/expenses?tab=review" className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
              <ClipboardCheck className="size-6" /> <span className="font-semibold">{pendingReview} expense(s) to verify</span>
            </Link>
          )}
        </div>
      )}

      {/* Quick access */}
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        <QuickCard to="/tickets" icon={<Ticket className="size-6" />} label="View Tickets" />
        <QuickCard to="/itinerary" icon={<CalendarDays className="size-6" />} label="Itinerary" tone="sky" />
        <QuickCard to="/accommodation" icon={<Hotel className="size-6" />} label="Hotel Details" tone="violet" />
        <QuickCard to="/transport" icon={<Bus className="size-6" />} label="Transport" tone="sun" />
        <QuickCard to="/expenses/new" icon={<Receipt className="size-6" />} label="Add Expense" tone="emerald" />
        <QuickCard to="/chat" icon={<MessagesSquare className="size-6" />} label="Group Chat" tone="rose" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Today / upcoming */}
          <Card>
            <CardHeader
              icon={<CalendarDays className="size-5" />}
              title={phase.phase === 'during' ? "Today's schedule" : 'Upcoming activities'}
              subtitle={phase.phase === 'during' ? formatDateLong(todayIso) : undefined}
              action={<Link to="/itinerary" className="text-sm font-semibold text-brand-700">Full itinerary</Link>}
            />
            <CardBody>
              {(phase.phase === 'during' ? today : upcoming).length === 0 ? (
                <EmptyState title={phase.phase === 'during' ? 'Nothing planned today' : 'No upcoming activities'} message="The admin will add the plan soon." />
              ) : (
                <ul className="space-y-1">
                  {(phase.phase === 'during' ? today : upcoming).map((i) => (
                    <div key={i.id}>
                      {phase.phase !== 'during' && <p className="ml-24 pl-4 text-xs font-semibold uppercase text-slate-400">Day {i.dayNumber} · {formatDateLong(i.date)}</p>}
                      <ItineraryRow item={i} />
                    </div>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <div className="grid gap-6 sm:grid-cols-2">
            <Card>
              <CardHeader icon={<Train className="size-5" />} title="Travel" action={<Link to="/tickets" className="text-sm font-semibold text-brand-700">Tickets</Link>} />
              <CardBody>
                {nextTicket ? (
                  <div className="space-y-1">
                    <p className="font-semibold">{nextTicket.trainName} <span className="text-slate-500">#{nextTicket.trainNumber}</span></p>
                    <p className="text-slate-700">{nextTicket.boardingStation} → {nextTicket.destinationStation}</p>
                    <p className="text-slate-600">{formatDate(nextTicket.journeyDate)} · {formatTime(nextTicket.departureTime)}</p>
                    <p className="text-sm text-slate-500">PNR {nextTicket.pnr} · {tickets.data.length} ticket(s) uploaded</p>
                  </div>
                ) : (
                  <p className="text-slate-500">No tickets uploaded yet.</p>
                )}
              </CardBody>
            </Card>
            <Card>
              <CardHeader icon={<Hotel className="size-5" />} title="Hotel" action={<Link to="/accommodation" className="text-sm font-semibold text-brand-700">Details</Link>} />
              <CardBody>
                {hotel ? (
                  <div className="space-y-2">
                    <p className="font-semibold">{hotel.name}</p>
                    <p className="text-slate-600">Check-in {formatDate(hotel.checkInDate)} {formatTime(hotel.checkInTime)}</p>
                    <div className="flex flex-wrap gap-2">
                      <MapButton url={hotel.mapsUrl} address={hotel.address} />
                      <CallButton phone={hotel.contactNumber} label="Call hotel" />
                    </div>
                  </div>
                ) : (
                  <p className="text-slate-500">Hotel details coming soon.</p>
                )}
              </CardBody>
            </Card>
          </div>
          {vehicle && (
            <Card>
              <CardHeader icon={<Bus className="size-5" />} title="Next pickup" action={<Link to="/transport" className="text-sm font-semibold text-brand-700">Transport</Link>} />
              <CardBody className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">{vehicle.vehicleType} {vehicle.registrationNumber && `· ${vehicle.registrationNumber}`}</p>
                  <p className="text-slate-600">{vehicle.pickupLocation} · {formatDate(vehicle.pickupDate)} {formatTime(vehicle.pickupTime)}</p>
                  {vehicle.driverName && <p className="text-sm text-slate-500">Driver: {vehicle.driverName}</p>}
                </div>
                <CallButton phone={vehicle.driverPhone} label="Call driver" />
              </CardBody>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader icon={<Megaphone className="size-5" />} title="Announcements" action={<Link to="/announcements" className="text-sm font-semibold text-brand-700">All</Link>} />
            <CardBody>
              {announcements.data.length === 0 ? (
                <p className="text-slate-500">No announcements yet.</p>
              ) : (
                <ul className="space-y-3">
                  {announcements.data.map((a) => (
                    <li key={a.id} className={`rounded-xl p-3 ${a.priority === 'important' ? 'bg-amber-50 border border-amber-200' : 'bg-slate-50'}`}>
                      <p className="font-semibold">{a.title}</p>
                      <p className="line-clamp-3 whitespace-pre-line text-sm text-slate-700">{a.body}</p>
                      <p className="mt-1 text-xs text-slate-500">{a.createdByName} · {timeAgo(a.createdAt)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader icon={<Activity className="size-5" />} title="Recent activity" action={<Link to="/notifications" className="text-sm font-semibold text-brand-700">All</Link>} />
            <CardBody>
              {notifications.length === 0 ? (
                <p className="text-slate-500">Nothing yet.</p>
              ) : (
                <ul className="space-y-3">
                  {notifications.slice(0, 6).map((n) => (
                    <li key={n.id}>
                      <Link to={n.link || '/notifications'} className="block hover:text-brand-700">
                        <p className="font-medium">{n.title}</p>
                        <p className="text-sm text-slate-600 line-clamp-2">{n.body}</p>
                        <p className="text-xs text-slate-400">{timeAgo(n.createdAt)}</p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
          {admin && approved.length < 2 && (
            <Notice tone="info">
              <Users className="mb-1 size-5" />
              Share this app's link with your family. They sign in with Google and request to join; you approve them under <Link className="font-semibold underline" to="/admin/approvals">Member Approvals</Link>.
            </Notice>
          )}
        </div>
      </div>
    </div>
  );
}
