import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const faqs = [
  {
    id: "faq1",
    question: "How quickly can I get medical assistance?",
    answer: "Our emergency support is available 24/7 with response times typically under 2 minutes for urgent situations. For non-emergency consultations, you can usually connect with a healthcare professional within 15-30 minutes.",
  },
  {
    id: "faq2",
    question: "Are virtual consultations covered by insurance?",
    answer: "Yes, most insurance plans now cover telemedicine consultations. We work with major insurance providers and can help verify your coverage before your appointment. We also offer affordable self-pay options.",
  },
  {
    id: "faq3",
    question: "How secure is my health information?",
    answer: "We maintain the highest security standards and are fully HIPAA compliant. All communications are encrypted, and your personal health information is protected with enterprise-grade security measures. Your privacy is our top priority.",
  },
  {
    id: "faq4",
    question: "What types of conditions can you help with?",
    answer: "Our healthcare professionals can assist with a wide range of conditions including urgent care needs, chronic disease management, mental health support, preventive care, prescription management, and general health consultations.",
  },
];

export default function FAQ() {
  const [openFAQ, setOpenFAQ] = useState<string | null>(null);

  const toggleFAQ = (faqId: string) => {
    setOpenFAQ(openFAQ === faqId ? null : faqId);
  };

  return (
    <section id="faq" className="py-20 bg-muted/50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-6">
            Frequently Asked{" "}
            <span className="text-primary">Questions</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Get answers to common questions about our healthcare services and support options.
          </p>
        </div>

        <div className="max-w-4xl mx-auto space-y-4">
          {faqs.map((faq) => (
            <div key={faq.id} className="bg-card border border-border rounded-xl">
              <button
                className="w-full text-left p-6 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-xl"
                onClick={() => toggleFAQ(faq.id)}
                data-testid={`button-${faq.id}`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">{faq.question}</h3>
                  <ChevronDown 
                    className={cn(
                      "h-5 w-5 transform transition-transform duration-200",
                      openFAQ === faq.id ? "rotate-180" : "rotate-0"
                    )}
                  />
                </div>
              </button>
              {openFAQ === faq.id && (
                <div className="px-6 pb-6" data-testid={`content-${faq.id}`}>
                  <p className="text-muted-foreground leading-relaxed">
                    {faq.answer}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
