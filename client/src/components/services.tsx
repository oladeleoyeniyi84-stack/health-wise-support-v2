import { Button } from "@/components/ui/button";
import { 
  Ambulance, 
  Video, 
  TrendingUp, 
  Pill, 
  Brain, 
  GraduationCap, 
  ArrowRight 
} from "lucide-react";

const services = [
  {
    id: "emergency-support",
    icon: Ambulance,
    title: "Emergency Support",
    description: "Immediate medical assistance and emergency guidance available 24/7. Connect with emergency responders instantly.",
    buttonText: "Learn More",
    iconColor: "text-destructive",
    bgColor: "bg-destructive/20",
  },
  {
    id: "virtual-consultations",
    icon: Video,
    title: "Virtual Consultations",
    description: "Connect with licensed healthcare professionals from the comfort of your home through secure video consultations.",
    buttonText: "Book Session",
    iconColor: "text-secondary",
    bgColor: "bg-secondary/20",
  },
  {
    id: "health-monitoring",
    icon: TrendingUp,
    title: "Health Monitoring",
    description: "Track your health metrics, receive personalized insights, and get proactive recommendations from our AI-powered platform.",
    buttonText: "Start Tracking",
    iconColor: "text-primary",
    bgColor: "bg-primary/20",
  },
  {
    id: "prescription-management",
    icon: Pill,
    title: "Prescription Management",
    description: "Digital prescription management, automatic refill reminders, and direct pharmacy coordination services.",
    buttonText: "Manage Prescriptions",
    iconColor: "text-accent",
    bgColor: "bg-accent/20",
  },
  {
    id: "mental-health-support",
    icon: Brain,
    title: "Mental Health Support",
    description: "Professional mental health counseling, therapy sessions, and emotional wellness programs tailored to your needs.",
    buttonText: "Find Support",
    iconColor: "text-secondary",
    bgColor: "bg-secondary/20",
  },
  {
    id: "health-education",
    icon: GraduationCap,
    title: "Health Education",
    description: "Access comprehensive health resources, educational materials, and personalized wellness programs.",
    buttonText: "Explore Resources",
    iconColor: "text-primary",
    bgColor: "bg-primary/20",
  },
];

export default function Services() {
  return (
    <section id="services" className="py-20 bg-background">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-6">
            Comprehensive Healthcare{" "}
            <span className="text-primary">Services</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            From emergency consultations to ongoing health management, we provide the full spectrum of healthcare support services.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {services.map((service) => (
            <div
              key={service.id}
              className="bg-card border border-border rounded-2xl p-8 hover:shadow-lg transition-shadow"
            >
              <div className={`w-14 h-14 ${service.bgColor} rounded-lg flex items-center justify-center mb-6`}>
                <service.icon className={`${service.iconColor} text-2xl h-7 w-7`} />
              </div>
              <h3 className="text-2xl font-semibold mb-4">{service.title}</h3>
              <p className="text-muted-foreground mb-6 leading-relaxed">
                {service.description}
              </p>
              <Button 
                variant="link" 
                className="text-primary hover:text-primary/80 font-medium p-0 h-auto"
                data-testid={`button-${service.id}`}
              >
                {service.buttonText} <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
