import { useState, useEffect } from 'react';
import { useSearchParams, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { format, addDays, setHours, setMinutes, isAfter, isBefore, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { Check, Clock, User, Wrench, Calendar as CalendarIcon, Phone, ChevronLeft, ChevronRight, Loader2, Settings, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ManageAppointment } from '@/components/booking/ManageAppointment';

interface Service {
  id: string;
  name: string;
  duration: number;
  price: number;
}

interface TeamMember {
  id: string;
  full_name: string;
  email: string;
}

interface TimeSlot {
  start: Date;
  end: Date;
  available: boolean;
}

interface CalendarEvent {
  user_id: string;
  start_time: string;
  end_time: string;
}

type BookingStep = 'service' | 'professional' | 'datetime' | 'contact' | 'confirm';

const BookingPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  
  // Workshop data
  const [workshopId, setWorkshopId] = useState<string | null>(null);
  const [workshopName, setWorkshopName] = useState<string>('');
  const [workshopNotFound, setWorkshopNotFound] = useState(false);
  const [services, setServices] = useState<Service[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  
  // Booking state
  const [currentStep, setCurrentStep] = useState<BookingStep>('service');
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedProfessional, setSelectedProfessional] = useState<TeamMember | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTime, setSelectedTime] = useState<TimeSlot | null>(null);
  const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  
  // Contact info with prefill
  const [contactName, setContactName] = useState(searchParams.get('name') || '');
  const [contactPhone, setContactPhone] = useState(searchParams.get('phone') || '');
  
  // Calendar events for availability
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);

  // Load workshop data by slug
  useEffect(() => {
    const loadWorkshopData = async () => {
      if (!slug) {
        setWorkshopNotFound(true);
        setLoading(false);
        return;
      }

      try {
        // Get workshop info by slug
        const { data: workshop, error: workshopError } = await supabase
          .from('workshops')
          .select('id, name, is_active')
          .eq('slug', slug)
          .maybeSingle();
        
        if (workshopError) throw workshopError;
        
        if (!workshop) {
          setWorkshopNotFound(true);
          setLoading(false);
          return;
        }

        if (!workshop.is_active) {
          setWorkshopNotFound(true);
          setLoading(false);
          return;
        }

        setWorkshopId(workshop.id);
        setWorkshopName(workshop.name);
        
        // Get services from bot_settings
        const { data: botSettings, error: botError } = await supabase
          .from('bot_settings')
          .select('services_json')
          .eq('workshop_id', workshop.id)
          .maybeSingle();
        
        if (botError) throw botError;
        if (botSettings?.services_json && Array.isArray(botSettings.services_json)) {
          const parsedServices = botSettings.services_json as unknown as Service[];
          setServices(parsedServices);
          
          // Pre-select service from URL if provided
          const serviceParam = searchParams.get('service');
          if (serviceParam) {
            const preselectedService = parsedServices.find(
              s => s.name.toLowerCase() === serviceParam.toLowerCase() || s.id === serviceParam
            );
            if (preselectedService) {
              setSelectedService(preselectedService);
              setCurrentStep('professional');
            }
          }
        }
        
        // Get team members
        const { data: teamData, error: teamError } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .eq('workshop_id', workshop.id)
          .eq('status', 'active');
        
        if (teamError) throw teamError;
        if (teamData) setTeam(teamData);
        
      } catch (error) {
        console.error('Error loading workshop data:', error);
        toast({
          title: 'Error',
          description: 'No se pudo cargar la información del taller',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };
    
    loadWorkshopData();
  }, [slug, searchParams, toast]);

  // Load calendar events when professional is selected
  useEffect(() => {
    if (!selectedProfessional || !workshopId) return;
    
    const loadEvents = async () => {
      const startDate = new Date();
      const endDate = addDays(startDate, 30);
      
      const { data, error } = await supabase
        .rpc('get_public_calendar_events', {
          _workshop_id: workshopId,
          _user_id: selectedProfessional.id,
          _start: startDate.toISOString(),
          _end: endDate.toISOString(),
        });
      
      if (error) {
        console.error('Error loading events:', error);
        return;
      }
      
      setCalendarEvents(data || []);
    };
    
    loadEvents();
  }, [selectedProfessional, workshopId]);

  // Generate available time slots for selected date
  useEffect(() => {
    if (!selectedDate || !selectedProfessional || !selectedService) return;
    
    setLoadingSlots(true);
    
    // Generate slots from 9am to 6pm, every 30 minutes
    const slots: TimeSlot[] = [];
    const startHour = 9;
    const endHour = 18;
    
    for (let hour = startHour; hour < endHour; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const slotStart = setMinutes(setHours(selectedDate, hour), minute);
        const slotEnd = setMinutes(setHours(selectedDate, hour), minute + selectedService.duration);
        
        // Check if slot is in the past
        if (isBefore(slotStart, new Date())) {
          continue;
        }
        
        // Check if slot conflicts with any event
        const hasConflict = calendarEvents.some(event => {
          const eventStart = new Date(event.start_time);
          const eventEnd = new Date(event.end_time);
          
          // Check for overlap
          return (
            (isAfter(slotStart, eventStart) && isBefore(slotStart, eventEnd)) ||
            (isAfter(slotEnd, eventStart) && isBefore(slotEnd, eventEnd)) ||
            (isBefore(slotStart, eventStart) && isAfter(slotEnd, eventEnd)) ||
            isSameDay(slotStart, eventStart) && slotStart.getTime() === eventStart.getTime()
          );
        });
        
        slots.push({
          start: slotStart,
          end: slotEnd,
          available: !hasConflict,
        });
      }
    }
    
    setAvailableSlots(slots);
    setLoadingSlots(false);
  }, [selectedDate, selectedProfessional, selectedService, calendarEvents]);

  const handleSubmit = async () => {
    if (!selectedService || !selectedProfessional || !selectedTime || !contactName || !contactPhone || !workshopId) {
      toast({
        title: 'Faltan datos',
        description: 'Por favor complete todos los campos',
        variant: 'destructive',
      });
      return;
    }

    const normalizePhone = (value: string) => value.replace(/\s+/g, ' ').trim();

    const getErrorDebug = (err: unknown) => {
      if (!err) return '';
      if (err instanceof Error) return err.message;
      if (typeof err === 'string') return err;
      try {
        return JSON.stringify(err);
      } catch {
        return String(err);
      }
    };

    setSubmitting(true);

    try {
      const phone = normalizePhone(contactPhone);

      // Create booking in backend to avoid client-side RLS issues on public pages
      const { data, error } = await supabase.functions.invoke('public-booking-create', {
        body: {
          workshop_id: workshopId,
          professional_id: selectedProfessional.id,
          service_name: selectedService.name,
          start_datetime: selectedTime.start.toISOString(),
          end_datetime: selectedTime.end.toISOString(),
          contact_name: contactName,
          contact_phone: phone,
        },
      });

      if (error) throw error;
      if (!data?.ok || !data?.appointment_id) {
        throw new Error(`Respuesta inválida del servidor: ${JSON.stringify(data)}`);
      }

      toast({
        title: '¡Cita agendada!',
        description: `Tu cita ha sido confirmada para el ${format(selectedTime.start, "EEEE d 'de' MMMM 'a las' HH:mm", { locale: es })}`,
      });

      setCurrentStep('confirm');
    } catch (error) {
      console.error('Error creating appointment:', error);
      toast({
        title: 'Error',
        description: `No se pudo crear la cita. Intenta nuevamente.\n\nDetalle: ${getErrorDebug(error)}`,
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const goBack = () => {
    const steps: BookingStep[] = ['service', 'professional', 'datetime', 'contact'];
    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex > 0) {
      setCurrentStep(steps[currentIndex - 1]);
    }
  };

  const goNext = () => {
    const steps: BookingStep[] = ['service', 'professional', 'datetime', 'contact'];
    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex < steps.length - 1) {
      setCurrentStep(steps[currentIndex + 1]);
    }
  };

  if (loading) {
    return (
      <div className="public-shell flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (workshopNotFound) {
    return (
      <div className="public-shell flex items-center justify-center p-4">
        <Card className="public-card w-full max-w-md text-center">
          <CardHeader>
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <CardTitle className="text-2xl">Taller no encontrado</CardTitle>
            <CardDescription>
              El taller que buscas no existe o no está disponible en este momento.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (currentStep === 'confirm') {
    return (
      <div className="public-shell p-4 flex items-center justify-center">
        <Card className="public-card w-full max-w-md text-center">
          <CardHeader>
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Check className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">¡Cita Confirmada!</CardTitle>
            <CardDescription>Te esperamos en {workshopName}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted rounded-lg p-4 text-left space-y-2">
              <div className="flex items-center gap-2">
                <Wrench className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{selectedService?.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span>{selectedProfessional?.full_name}</span>
              </div>
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                <span>{selectedTime && format(selectedTime.start, "EEEE d 'de' MMMM", { locale: es })}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span>{selectedTime && format(selectedTime.start, 'HH:mm', { locale: es })} hrs</span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Te enviaremos un recordatorio antes de tu cita.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const stepNumber = ['service', 'professional', 'datetime', 'contact'].indexOf(currentStep) + 1;

  return (
    <div className="public-shell">
      {/* Header */}
      <header className="border-b border-border/60 bg-background/70 backdrop-blur-md sticky top-0 z-10">
        <div className="public-container py-4">
          <h1 className="text-xl font-bold text-center">{workshopName}</h1>
          <p className="text-sm text-muted-foreground text-center">Agenda o gestiona tu cita online</p>
        </div>
      </header>

      {/* Tabs for new booking vs manage */}
      <div className="public-container py-6">
        <Tabs defaultValue="new" className="w-full max-w-xl mx-auto">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="new" className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4" />
              Nueva Cita
            </TabsTrigger>
            <TabsTrigger value="manage" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Mis Citas
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="manage" className="mt-4">
            <div className="public-card p-4 sm:p-6">
              {workshopId && <ManageAppointment workshopId={workshopId} />}
            </div>
          </TabsContent>

          <TabsContent value="new" className="mt-4">
            <div className="public-card p-4 sm:p-6 space-y-6">
              {/* Progress */}
              <div className="flex items-center justify-center gap-2">
                {[1, 2, 3, 4].map((step) => (
                  <div key={step} className="flex items-center">
                    <div
                      className={cn(
                        'h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors',
                        step <= stepNumber
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground'
                      )}
                    >
                      {step < stepNumber ? <Check className="h-4 w-4" /> : step}
                    </div>
                    {step < 4 && (
                      <div
                        className={cn(
                          'w-8 h-1 mx-1',
                          step < stepNumber ? 'bg-primary' : 'bg-muted'
                        )}
                      />
                    )}
                  </div>
                ))}
              </div>

            {/* Step 1: Service */}
            {currentStep === 'service' && (
          <div className="max-w-md mx-auto space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Wrench className="h-5 w-5" />
              Selecciona un servicio
            </h2>
            <div className="space-y-3">
              {services.map((service) => (
                <Card
                  key={service.id}
                  className={cn(
                    'cursor-pointer transition-all touch-manipulation active:scale-[0.98] bg-background/80',
                    selectedService?.id === service.id
                      ? 'ring-2 ring-primary bg-primary/5'
                      : 'hover:bg-muted/50'
                  )}
                  onClick={() => setSelectedService(service)}
                >
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium">{service.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {service.duration} min
                      </p>
                    </div>
                    <Badge variant="secondary">
                      ${service.price.toLocaleString('es-CL')}
                    </Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
            <Button
              className="w-full"
              disabled={!selectedService}
              onClick={() => setCurrentStep('professional')}
            >
              Continuar
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
            </div>
            )}

            {/* Step 2: Professional */}
            {currentStep === 'professional' && (
          <div className="max-w-md mx-auto space-y-4">
            <Button variant="ghost" size="sm" onClick={goBack} className="mb-2">
              <ChevronLeft className="mr-2 h-4 w-4" />
              Volver
            </Button>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <User className="h-5 w-5" />
              Selecciona un profesional
            </h2>
            <div className="space-y-3">
              {team.map((member) => (
                <Card
                  key={member.id}
                  className={cn(
                    'cursor-pointer transition-all touch-manipulation active:scale-[0.98] bg-background/80',
                    selectedProfessional?.id === member.id
                      ? 'ring-2 ring-primary bg-primary/5'
                      : 'hover:bg-muted/50'
                  )}
                  onClick={() => setSelectedProfessional(member)}
                >
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">{member.full_name}</p>
                      <p className="text-sm text-muted-foreground">Disponible</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            <Button
              className="w-full"
              disabled={!selectedProfessional}
              onClick={() => setCurrentStep('datetime')}
            >
              Continuar
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
            </div>
            )}

            {/* Step 3: Date & Time */}
            {currentStep === 'datetime' && (
          <div className="max-w-md mx-auto space-y-4">
            <Button variant="ghost" size="sm" onClick={goBack} className="mb-2">
              <ChevronLeft className="mr-2 h-4 w-4" />
              Volver
            </Button>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <CalendarIcon className="h-5 w-5" />
              Selecciona fecha y hora
            </h2>
            
            <Card className="bg-background/80">
              <CardContent className="p-4">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => {
                    setSelectedDate(date);
                    setSelectedTime(null);
                  }}
                  disabled={(date) => date < new Date() || date > addDays(new Date(), 30)}
                  locale={es}
                  className="mx-auto"
                />
              </CardContent>
            </Card>
            
            {selectedDate && (
              <Card className="bg-background/80">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">
                    Horarios disponibles - {format(selectedDate, "EEEE d 'de' MMMM", { locale: es })}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {loadingSlots ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  ) : (
                    <ScrollArea className="h-[200px]">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {availableSlots.filter(s => s.available).length === 0 ? (
                          <p className="col-span-2 sm:col-span-3 text-center text-muted-foreground py-4">
                            No hay horarios disponibles para este día
                          </p>
                        ) : (
                          availableSlots
                            .filter((slot) => slot.available)
                            .map((slot, index) => (
                              <Button
                                key={index}
                                variant={selectedTime?.start.getTime() === slot.start.getTime() ? 'default' : 'outline'}
                                size="sm"
                                className="touch-manipulation"
                                onClick={() => setSelectedTime(slot)}
                              >
                                {format(slot.start, 'HH:mm')}
                              </Button>
                            ))
                        )}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            )}
            
            <Button
              className="w-full"
              disabled={!selectedTime}
              onClick={() => setCurrentStep('contact')}
            >
              Continuar
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
            </div>
            )}

            {/* Step 4: Contact Info */}
            {currentStep === 'contact' && (
          <div className="max-w-md mx-auto space-y-4">
            <Button variant="ghost" size="sm" onClick={goBack} className="mb-2">
              <ChevronLeft className="mr-2 h-4 w-4" />
              Volver
            </Button>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Phone className="h-5 w-5" />
              Tus datos de contacto
            </h2>
            
            <Card className="bg-background/80">
              <CardContent className="p-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nombre completo</Label>
                  <Input
                    id="name"
                    placeholder="Tu nombre"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Teléfono</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="+56 9 1234 5678"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>
            
            <Separator />
            
            {/* Summary */}
            <Card className="bg-background/80">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Resumen de tu cita</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Servicio</span>
                  <span className="font-medium">{selectedService?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Profesional</span>
                  <span className="font-medium">{selectedProfessional?.full_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Fecha</span>
                  <span className="font-medium">
                    {selectedTime && format(selectedTime.start, "d 'de' MMMM", { locale: es })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Hora</span>
                  <span className="font-medium">
                    {selectedTime && format(selectedTime.start, 'HH:mm')} hrs
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between font-medium">
                  <span>Total</span>
                  <span>${selectedService?.price.toLocaleString('es-CL')}</span>
                </div>
              </CardContent>
            </Card>
            
            <Button
              className="w-full"
              disabled={!contactName || !contactPhone || submitting}
              onClick={handleSubmit}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Confirmando...
                </>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Confirmar Cita
                </>
              )}
            </Button>
            </div>
            )}
          </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default BookingPage;
