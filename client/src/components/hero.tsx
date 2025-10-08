import { Button } from "@/components/ui/button";
import { Phone, Calendar, Shield, Clock, UserCheck } from "lucide-react";

export default function Hero() {
  return (
    <section id="home" className="health-gradient py-20 lg:py-32">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-8">
            <div className="space-y-4">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight">
                Professional{" "}
                <span className="text-primary">Health Support</span>{" "}
                When You Need It Most
              </h1>
              <p className="text-xl text-muted-foreground leading-relaxed">
                Access comprehensive healthcare assistance, expert guidance, and 24/7 support from certified professionals. Your health journey starts here.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <Button size="lg" className="text-lg" data-testid="button-immediate-help">
                <Phone className="mr-2 h-5 w-5" />
                Get Immediate Help
              </Button>
              <Button variant="outline" size="lg" className="text-lg border-primary text-primary hover:bg-primary/10" data-testid="button-schedule-consultation">
                <Calendar className="mr-2 h-5 w-5" />
                Schedule Consultation
              </Button>
            </div>

            {/* Trust Indicators */}
            <div className="flex items-center space-x-6 pt-4">
              <div className="flex items-center space-x-2">
                <Shield className="h-5 w-5 text-secondary" />
                <span className="text-sm text-muted-foreground font-medium">HIPAA Compliant</span>
              </div>
              <div className="flex items-center space-x-2">
                <Clock className="h-5 w-5 text-secondary" />
                <span className="text-sm text-muted-foreground font-medium">24/7 Available</span>
              </div>
              <div className="flex items-center space-x-2">
                <UserCheck className="h-5 w-5 text-secondary" />
                <span className="text-sm text-muted-foreground font-medium">Licensed Professionals</span>
              </div>
            </div>
          </div>

          <div className="relative">
            <img
              src="https://images.unsplash.com/photo-1559757148-5c350d0d3c56?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=800&h=600"
              alt="Professional healthcare consultant using digital tablet in modern medical office"
              className="rounded-2xl shadow-2xl w-full h-auto"
            />

            {/* Floating Stats Cards */}
            <div className="absolute -bottom-6 -left-6 bg-card p-4 rounded-xl shadow-lg border border-border">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-secondary/20 rounded-lg flex items-center justify-center">
                  <UserCheck className="text-secondary text-xl" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground" data-testid="text-patients-helped">10,000+</p>
                  <p className="text-sm text-muted-foreground">Patients Helped</p>
                </div>
              </div>
            </div>

            <div className="absolute -top-6 -right-6 bg-card p-4 rounded-xl shadow-lg border border-border">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-accent/20 rounded-lg flex items-center justify-center">
                  <span className="text-accent text-xl">★</span>
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground" data-testid="text-satisfaction-rate">4.9/5</p>
                  <p className="text-sm text-muted-foreground">Satisfaction Rate</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
