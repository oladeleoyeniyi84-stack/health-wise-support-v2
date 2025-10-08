import { Heart, Facebook, Twitter, Linkedin, Youtube } from "lucide-react";

export default function Footer() {
  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <footer className="bg-foreground text-background py-16">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-4 gap-8">
          {/* Company Info */}
          <div className="lg:col-span-2">
            <div className="flex items-center space-x-3 mb-6">
              <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
                <Heart className="text-primary-foreground text-xl" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-primary">Health-wise</h1>
                <p className="text-sm text-muted -mt-1">Support</p>
              </div>
            </div>
            <p className="text-muted mb-6 leading-relaxed max-w-md">
              Providing comprehensive healthcare support and professional medical assistance to help you maintain optimal health and wellness.
            </p>
            <div className="flex space-x-4">
              <button
                className="w-10 h-10 bg-primary/20 rounded-lg flex items-center justify-center hover:bg-primary/30 transition-colors"
                data-testid="link-facebook"
              >
                <Facebook className="text-primary h-5 w-5" />
              </button>
              <button
                className="w-10 h-10 bg-primary/20 rounded-lg flex items-center justify-center hover:bg-primary/30 transition-colors"
                data-testid="link-twitter"
              >
                <Twitter className="text-primary h-5 w-5" />
              </button>
              <button
                className="w-10 h-10 bg-primary/20 rounded-lg flex items-center justify-center hover:bg-primary/30 transition-colors"
                data-testid="link-linkedin"
              >
                <Linkedin className="text-primary h-5 w-5" />
              </button>
              <button
                className="w-10 h-10 bg-primary/20 rounded-lg flex items-center justify-center hover:bg-primary/30 transition-colors"
                data-testid="link-youtube"
              >
                <Youtube className="text-primary h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="font-semibold text-lg mb-6">Quick Links</h3>
            <ul className="space-y-3">
              <li>
                <button
                  onClick={() => scrollToSection("home")}
                  className="text-muted hover:text-primary transition-colors"
                  data-testid="footer-nav-home"
                >
                  Home
                </button>
              </li>
              <li>
                <button
                  onClick={() => scrollToSection("services")}
                  className="text-muted hover:text-primary transition-colors"
                  data-testid="footer-nav-services"
                >
                  Services
                </button>
              </li>
              <li>
                <button
                  onClick={() => scrollToSection("faq")}
                  className="text-muted hover:text-primary transition-colors"
                  data-testid="footer-nav-faq"
                >
                  FAQ
                </button>
              </li>
              <li>
                <button
                  onClick={() => scrollToSection("contact")}
                  className="text-muted hover:text-primary transition-colors"
                  data-testid="footer-nav-contact"
                >
                  Contact
                </button>
              </li>
              <li>
                <a href="#" className="text-muted hover:text-primary transition-colors" data-testid="footer-nav-about">
                  About Us
                </a>
              </li>
              <li>
                <a href="#" className="text-muted hover:text-primary transition-colors" data-testid="footer-nav-careers">
                  Careers
                </a>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="font-semibold text-lg mb-6">Legal</h3>
            <ul className="space-y-3">
              <li>
                <button
                  onClick={() => scrollToSection("terms")}
                  className="text-muted hover:text-primary transition-colors"
                  data-testid="footer-nav-terms"
                >
                  Terms of Service
                </button>
              </li>
              <li>
                <button
                  onClick={() => scrollToSection("privacy")}
                  className="text-muted hover:text-primary transition-colors"
                  data-testid="footer-nav-privacy"
                >
                  Privacy Policy
                </button>
              </li>
              <li>
                <a href="#" className="text-muted hover:text-primary transition-colors" data-testid="footer-nav-cookies">
                  Cookie Policy
                </a>
              </li>
              <li>
                <a href="#" className="text-muted hover:text-primary transition-colors" data-testid="footer-nav-hipaa">
                  HIPAA Compliance
                </a>
              </li>
              <li>
                <a href="#" className="text-muted hover:text-primary transition-colors" data-testid="footer-nav-accessibility">
                  Accessibility
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-border/10 mt-12 pt-8">
          <div className="flex flex-col sm:flex-row justify-between items-center space-y-4 sm:space-y-0">
            <p className="text-muted text-sm" data-testid="text-copyright">
              © 2024 Health-wise Support. All rights reserved.
            </p>
            <p className="text-muted text-sm" data-testid="text-compliance">
              Licensed healthcare providers • HIPAA compliant • 24/7 emergency support
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
