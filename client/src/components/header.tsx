import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Heart, Menu, X } from "lucide-react";

export default function Header() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    setIsMobileMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
      <nav className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex-shrink-0">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
                <Heart className="text-primary-foreground text-xl" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-primary">Health-wise</h1>
                <p className="text-sm text-muted-foreground -mt-1">Support</p>
              </div>
            </div>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:block">
            <div className="flex items-center space-x-8">
              <button
                onClick={() => scrollToSection("home")}
                className="text-foreground hover:text-primary transition-colors font-medium"
                data-testid="nav-home"
              >
                Home
              </button>
              <button
                onClick={() => scrollToSection("services")}
                className="text-muted-foreground hover:text-primary transition-colors font-medium"
                data-testid="nav-services"
              >
                Services
              </button>
              <button
                onClick={() => scrollToSection("faq")}
                className="text-muted-foreground hover:text-primary transition-colors font-medium"
                data-testid="nav-faq"
              >
                FAQ
              </button>
              <button
                onClick={() => scrollToSection("terms")}
                className="text-muted-foreground hover:text-primary transition-colors font-medium"
                data-testid="nav-terms"
              >
                Terms
              </button>
              <button
                onClick={() => scrollToSection("privacy")}
                className="text-muted-foreground hover:text-primary transition-colors font-medium"
                data-testid="nav-privacy"
              >
                Privacy
              </button>
              <button
                onClick={() => scrollToSection("contact")}
                className="text-muted-foreground hover:text-primary transition-colors font-medium"
                data-testid="nav-contact"
              >
                Contact
              </button>
            </div>
          </div>

          {/* CTA Button */}
          <div className="hidden md:flex items-center space-x-4">
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="button-get-support">
              Get Support
            </Button>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleMobileMenu}
              data-testid="button-mobile-menu"
            >
              {isMobileMenuOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Menu className="h-6 w-6" />
              )}
            </Button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMobileMenuOpen && (
          <div className="md:hidden">
            <div className="px-2 pt-2 pb-3 space-y-1 border-t border-border">
              <button
                onClick={() => scrollToSection("home")}
                className="block px-3 py-2 text-foreground hover:text-primary transition-colors font-medium w-full text-left"
                data-testid="nav-mobile-home"
              >
                Home
              </button>
              <button
                onClick={() => scrollToSection("services")}
                className="block px-3 py-2 text-muted-foreground hover:text-primary transition-colors font-medium w-full text-left"
                data-testid="nav-mobile-services"
              >
                Services
              </button>
              <button
                onClick={() => scrollToSection("faq")}
                className="block px-3 py-2 text-muted-foreground hover:text-primary transition-colors font-medium w-full text-left"
                data-testid="nav-mobile-faq"
              >
                FAQ
              </button>
              <button
                onClick={() => scrollToSection("terms")}
                className="block px-3 py-2 text-muted-foreground hover:text-primary transition-colors font-medium w-full text-left"
                data-testid="nav-mobile-terms"
              >
                Terms
              </button>
              <button
                onClick={() => scrollToSection("privacy")}
                className="block px-3 py-2 text-muted-foreground hover:text-primary transition-colors font-medium w-full text-left"
                data-testid="nav-mobile-privacy"
              >
                Privacy
              </button>
              <button
                onClick={() => scrollToSection("contact")}
                className="block px-3 py-2 text-muted-foreground hover:text-primary transition-colors font-medium w-full text-left"
                data-testid="nav-mobile-contact"
              >
                Contact
              </button>
              <div className="pt-2">
                <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90" data-testid="button-mobile-get-support">
                  Get Support
                </Button>
              </div>
            </div>
          </div>
        )}
      </nav>
    </header>
  );
}
