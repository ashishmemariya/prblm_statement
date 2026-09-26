import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { axiosClient } from '../../api/axiosClient';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { Boxes, Mail, Lock, User } from 'lucide-react';

const signupSchema = z
  .object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    email: z.string().email('Please enter a valid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    confirmPassword: z.string(),
  })
  .refine((data: any) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

export const SignupPage = () => {
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [error, setError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof signupSchema>>({
    resolver: zodResolver(signupSchema),
  });

  const onSubmit = async (data: z.infer<typeof signupSchema>) => {
    try {
      setError('');
      const res = await axiosClient.post('/auth/signup', {
        name: data.name,
        email: data.email,
        password: data.password,
      });
      setAuth(res.data.data.user, res.data.data.token);
      toast.success('Account created successfully!');
      navigate('/app/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Signup failed');
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center gap-3 justify-center mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-primary to-indigo-500 flex items-center justify-center text-primary-foreground shadow-md">
            <Boxes className="w-5 h-5" />
          </div>
          <div className="text-xl font-extrabold tracking-tight gradient-text">StockSense</div>
        </div>

        <div className="text-center">
          <h1 className="text-2xl font-black tracking-tight text-foreground">Create Your Account</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Get instant access to real-time inventory management with zero backend setup.
          </p>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-destructive/15 border border-destructive/25 text-destructive text-xs font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" /> Full Name
            </label>
            <input
              {...register('name')}
              type="text"
              placeholder="Alex Harrison"
              className="mt-1 w-full h-11 rounded-xl border border-input bg-card px-3.5 text-sm focus:ring-2 focus:ring-primary outline-none"
            />
            {errors.name && <p className="text-xs text-destructive mt-1">{errors.name.message}</p>}
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5" /> Work Email
            </label>
            <input
              {...register('email')}
              type="email"
              placeholder="alex@enterprise.com"
              className="mt-1 w-full h-11 rounded-xl border border-input bg-card px-3.5 text-sm focus:ring-2 focus:ring-primary outline-none"
            />
            {errors.email && <p className="text-xs text-destructive mt-1">{errors.email.message}</p>}
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" /> Password
            </label>
            <input
              {...register('password')}
              type="password"
              placeholder="••••••••"
              className="mt-1 w-full h-11 rounded-xl border border-input bg-card px-3.5 text-sm focus:ring-2 focus:ring-primary outline-none"
            />
            {errors.password && <p className="text-xs text-destructive mt-1">{errors.password.message}</p>}
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" /> Confirm Password
            </label>
            <input
              {...register('confirmPassword')}
              type="password"
              placeholder="••••••••"
              className="mt-1 w-full h-11 rounded-xl border border-input bg-card px-3.5 text-sm focus:ring-2 focus:ring-primary outline-none"
            />
            {errors.confirmPassword && (
              <p className="text-xs text-destructive mt-1">{errors.confirmPassword.message}</p>
            )}
          </div>

          <button
            disabled={isSubmitting}
            className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center hover:bg-primary/90 shadow-md shadow-primary/20 transition-all"
            type="submit"
          >
            {isSubmitting ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <div className="text-center text-xs text-muted-foreground">
          Already have an account?{' '}
          <Link to="/login" className="text-primary font-bold hover:underline">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
};
