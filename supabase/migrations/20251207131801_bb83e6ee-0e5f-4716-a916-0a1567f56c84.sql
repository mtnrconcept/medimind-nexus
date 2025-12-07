-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'researcher', 'doctor');

-- Create user_roles table (separate from profiles for security)
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL DEFAULT 'doctor',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (user_id, role)
);

-- Create profiles table
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    first_name TEXT,
    last_name TEXT,
    specialty TEXT,
    institution TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create pathologies table
CREATE TABLE public.pathologies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    icd_code TEXT,
    synonyms TEXT[],
    description TEXT,
    category TEXT,
    specialty TEXT,
    severity TEXT CHECK (severity IN ('mild', 'moderate', 'severe', 'critical')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create symptoms table
CREATE TABLE public.symptoms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    body_system TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create pathology_symptoms junction table
CREATE TABLE public.pathology_symptoms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pathology_id UUID REFERENCES public.pathologies(id) ON DELETE CASCADE NOT NULL,
    symptom_id UUID REFERENCES public.symptoms(id) ON DELETE CASCADE NOT NULL,
    frequency_percent INTEGER CHECK (frequency_percent >= 0 AND frequency_percent <= 100),
    is_primary BOOLEAN DEFAULT false,
    UNIQUE (pathology_id, symptom_id)
);

-- Create treatments table
CREATE TABLE public.treatments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pathology_id UUID REFERENCES public.pathologies(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    type TEXT CHECK (type IN ('medication', 'surgery', 'therapy', 'lifestyle', 'other')),
    description TEXT,
    contraindications TEXT[],
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create sources/references table
CREATE TABLE public.medical_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pathology_id UUID REFERENCES public.pathologies(id) ON DELETE CASCADE NOT NULL,
    source_type TEXT CHECK (source_type IN ('pubmed', 'who', 'has', 'clinical_trial', 'other')),
    title TEXT NOT NULL,
    url TEXT,
    pubmed_id TEXT,
    published_date DATE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pathologies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.symptoms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pathology_symptoms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treatments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medical_sources ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Function to get user's role
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- RLS Policies for user_roles
CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage roles"
ON public.user_roles FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile"
ON public.profiles FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for pathologies (readable by all authenticated users)
CREATE POLICY "Authenticated users can view pathologies"
ON public.pathologies FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can manage pathologies"
ON public.pathologies FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for symptoms
CREATE POLICY "Authenticated users can view symptoms"
ON public.symptoms FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can manage symptoms"
ON public.symptoms FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for pathology_symptoms
CREATE POLICY "Authenticated users can view pathology_symptoms"
ON public.pathology_symptoms FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can manage pathology_symptoms"
ON public.pathology_symptoms FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for treatments
CREATE POLICY "Authenticated users can view treatments"
ON public.treatments FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can manage treatments"
ON public.treatments FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for medical_sources
CREATE POLICY "Authenticated users can view medical_sources"
ON public.medical_sources FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can manage medical_sources"
ON public.medical_sources FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Trigger for profile creation on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, first_name, last_name)
  VALUES (NEW.id, NEW.raw_user_meta_data ->> 'first_name', NEW.raw_user_meta_data ->> 'last_name');
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, COALESCE((NEW.raw_user_meta_data ->> 'role')::app_role, 'doctor'));
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_pathologies_updated_at
  BEFORE UPDATE ON public.pathologies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();